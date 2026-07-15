"""Data loading + leak-free feature engineering for MatchMind.

Two data sources:
  - dataset/historical_matches.csv  (600 pre-tournament internationals, 0-100 ratings)
  - dataset/matches.csv + teams.csv (WC2026: 94 completed + 10 remaining, Elo ratings)

Historical 0-100 ratings are mapped onto the Elo scale with a linear fit over the
32 teams present in both sources, so one model can learn from both.
"""

from __future__ import annotations

from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATASET_DIR = Path(__file__).resolve().parents[2] / "dataset"
ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"

FEATURE_NAMES = [
    "elo_home", "elo_away", "elo_diff",
    "winrate5_home", "winrate5_away",
    "goals_for5_home", "goals_for5_away",
    "goals_against5_home", "goals_against5_away",
    "is_knockout",
]
CLASSES = ["H", "D", "A"]  # home win / draw / away win

# Neutral priors used before a team has played 5 tracked matches
PRIOR_WINRATE, PRIOR_GF, PRIOR_GA = 0.40, 1.35, 1.35


def load_teams() -> pd.DataFrame:
    return pd.read_csv(DATASET_DIR / "teams.csv")


def load_remaining_teams() -> pd.DataFrame:
    """The verified live title-contender snapshot used by the live UI."""
    return pd.read_csv(DATASET_DIR / "remaining_teams.csv")


def load_remaining_snapshot() -> pd.DataFrame:
    return pd.read_csv(DATASET_DIR / "remaining_team_snapshot.csv")


def load_forecast_history() -> list[dict]:
    """Immutable pre-match tournament forecasts retained for the public ledger."""
    path = DATASET_DIR / "forecast_history.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get("snapshots", [])


def data_fingerprint() -> str:
    """Hash prediction-critical observed inputs to detect stale artifacts."""
    digest = hashlib.sha256()
    for name in ("matches.csv", "remaining_teams.csv", "current_bracket.csv"):
        digest.update(name.encode("utf-8"))
        digest.update((DATASET_DIR / name).read_bytes())
    return digest.hexdigest()[:16]


def load_wc_matches() -> pd.DataFrame:
    matches = pd.read_csv(DATASET_DIR / "matches.csv")
    teams = load_teams()[["team_id", "team_name"]]
    stages = pd.read_csv(DATASET_DIR / "tournament_stages.csv")
    matches = matches.merge(
        teams.rename(columns={"team_id": "home_team_id", "team_name": "home_team"}),
        on="home_team_id", how="left")
    matches = matches.merge(
        teams.rename(columns={"team_id": "away_team_id", "team_name": "away_team"}),
        on="away_team_id", how="left")
    matches = matches.merge(stages, on="stage_id", how="left")
    return matches.sort_values("match_id").reset_index(drop=True)


def load_historical() -> pd.DataFrame:
    return pd.read_csv(DATASET_DIR / "historical_matches.csv")


def rating_to_elo_map() -> tuple[float, float]:
    """Linear fit (slope, intercept): historical 0-100 rating -> WC Elo scale."""
    hist = load_historical()
    teams = load_teams()
    rat_a = hist[["team_a", "rating_a"]].rename(columns={"team_a": "team", "rating_a": "rating"})
    rat_b = hist[["team_b", "rating_b"]].rename(columns={"team_b": "team", "rating_b": "rating"})
    hist_rating = pd.concat([rat_a, rat_b]).groupby("team")["rating"].mean()
    merged = teams.set_index("team_name")["elo_rating"].to_frame().join(hist_rating, how="inner")
    slope, intercept = np.polyfit(merged["rating"], merged["elo_rating"], 1)
    return float(slope), float(intercept)


class FormTracker:
    """Rolling last-5 form per team, updated match by match (leak-free)."""

    def __init__(self) -> None:
        self.history: dict[str, deque] = defaultdict(lambda: deque(maxlen=5))

    def features(self, team: str) -> tuple[float, float, float]:
        h = self.history[team]
        if not h:
            return PRIOR_WINRATE, PRIOR_GF, PRIOR_GA
        wins = sum(1 for gf, ga in h if gf > ga)
        gf = sum(gf for gf, _ in h) / len(h)
        ga = sum(ga for _, ga in h) / len(h)
        return wins / len(h), gf, ga

    def update(self, team: str, goals_for: int, goals_against: int) -> None:
        self.history[team].append((goals_for, goals_against))


def _row(elo_h, elo_a, form: FormTracker, home, away, knockout) -> list[float]:
    wr_h, gf_h, ga_h = form.features(home)
    wr_a, gf_a, ga_a = form.features(away)
    return [elo_h, elo_a, elo_h - elo_a, wr_h, wr_a, gf_h, gf_a, ga_h, ga_a, float(knockout)]


def build_historical_features() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    """Feature matrix, labels and goal pairs for the 600 historical matches."""
    hist = load_historical()
    slope, intercept = rating_to_elo_map()
    form = FormTracker()
    rows, labels, goals = [], [], []
    for m in hist.itertuples():
        elo_a = slope * m.rating_a + intercept
        elo_b = slope * m.rating_b + intercept
        rows.append(_row(elo_a, elo_b, form, m.team_a, m.team_b, knockout=0))
        labels.append("H" if m.goals_a > m.goals_b else ("A" if m.goals_b > m.goals_a else "D"))
        goals.append((m.team_a, m.team_b, m.goals_a, m.goals_b))
        form.update(m.team_a, m.goals_a, m.goals_b)
        form.update(m.team_b, m.goals_b, m.goals_a)
    X = pd.DataFrame(rows, columns=FEATURE_NAMES)
    g = pd.DataFrame(goals, columns=["team", "opponent", "goals_for", "goals_against"])
    return X, pd.Series(labels, name="result"), g


def build_wc_features() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame, FormTracker]:
    """Features/labels for completed WC2026 matches + the form tracker state
    after the last completed match (used to featurize upcoming fixtures)."""
    matches = load_wc_matches()
    elo = load_teams().set_index("team_name")["elo_rating"].to_dict()
    form = FormTracker()
    rows, labels, meta = [], [], []
    for m in matches.itertuples():
        if m.status != "Completed" or pd.isna(m.home_score):
            continue
        rows.append(_row(elo[m.home_team], elo[m.away_team], form,
                         m.home_team, m.away_team, knockout=bool(m.is_knockout)))
        hs, as_ = int(m.home_score), int(m.away_score)
        labels.append("H" if hs > as_ else ("A" if as_ > hs else "D"))
        meta.append({"match_id": int(m.match_id), "date": m.date, "stage": m.stage_name,
                     "home": m.home_team, "away": m.away_team,
                     "home_score": hs, "away_score": as_})
        form.update(m.home_team, hs, as_)
        form.update(m.away_team, as_, hs)
    X = pd.DataFrame(rows, columns=FEATURE_NAMES)
    return X, pd.Series(labels, name="result"), pd.DataFrame(meta), form


def current_match_features(home: str, away: str, knockout: bool,
                           form: FormTracker | None = None) -> pd.DataFrame:
    """Feature row for an arbitrary matchup, using current tournament form."""
    if form is None:
        *_, form = build_wc_features()
    elo = load_teams().set_index("team_name")["elo_rating"].to_dict()
    if home not in elo or away not in elo:
        raise KeyError(f"Unknown team: {home if home not in elo else away}")
    row = _row(elo[home], elo[away], form, home, away, knockout)
    return pd.DataFrame([row], columns=FEATURE_NAMES)


def build_goal_dataset() -> pd.DataFrame:
    """Stacked per-team goal rows (historical + WC2026) for the Poisson model."""
    _, _, hist_goals = build_historical_features()
    matches = load_wc_matches()
    rows = []
    for m in matches.itertuples():
        if m.status != "Completed" or pd.isna(m.home_score):
            continue
        rows.append((m.home_team, m.away_team, int(m.home_score), int(m.away_score)))
        rows.append((m.away_team, m.home_team, int(m.away_score), int(m.home_score)))
    wc = pd.DataFrame(rows, columns=["team", "opponent", "goals_for", "goals_against"])
    hist_stacked = pd.concat([
        hist_goals,
        hist_goals.rename(columns={"team": "opponent", "opponent": "team",
                                   "goals_for": "goals_against", "goals_against": "goals_for"}),
    ])
    return pd.concat([hist_stacked, wc], ignore_index=True)[["team", "opponent", "goals_for"]]


# ---------------------------------------------------------------- bracket ---

# match_id -> (home_source, away_source); "W93" = winner of match 93, "L101" = loser
BRACKET_SOURCES = {
    97: ("W89", "W90"), 98: ("W93", "W94"), 99: ("W91", "W92"), 100: ("W95", "W96"),
    101: ("W97", "W98"), 102: ("W99", "W100"),
    103: ("L101", "L102"), 104: ("W101", "W102"),
}


def knockout_winner(m) -> str | None:
    """Winner of a completed knockout match row (penalties considered)."""
    if m.status != "Completed" or pd.isna(m.home_score):
        return None
    hs, as_ = int(m.home_score), int(m.away_score)
    if hs != as_:
        return m.home_team if hs > as_ else m.away_team
    if not pd.isna(m.home_penalty_score):
        return m.home_team if int(m.home_penalty_score) > int(m.away_penalty_score) else m.away_team
    return None


def bracket_state() -> list[dict]:
    """The 16 knockout-bracket slots (matches 89-104) with resolved teams where known."""
    matches = load_wc_matches()
    ko = matches[matches["match_id"] >= 89].set_index("match_id", drop=False)
    winners: dict[int, str | None] = {}
    losers: dict[int, str | None] = {}
    slots = []

    def resolve(source: str, slot_teams: dict[int, tuple]) -> str | None:
        ref = int(source[1:])
        return (winners if source[0] == "W" else losers).get(ref)

    for mid in sorted(ko.index):
        m = ko.loc[mid]
        home, away = m.home_team, m.away_team
        if (pd.isna(home) or home is None) and mid in BRACKET_SOURCES:
            src_h, src_a = BRACKET_SOURCES[mid]
            home = winners.get(int(src_h[1:])) if src_h[0] == "W" else losers.get(int(src_h[1:]))
            away = winners.get(int(src_a[1:])) if src_a[0] == "W" else losers.get(int(src_a[1:]))
        w = knockout_winner(m)
        if w is not None:
            winners[mid] = w
            losers[mid] = away if w == home else home
        slots.append({
            "match_id": int(mid), "date": m.date, "stage": m.stage_name,
            "home": None if pd.isna(home) else home,
            "away": None if pd.isna(away) else away,
            "home_score": None if pd.isna(m.home_score) else int(m.home_score),
            "away_score": None if pd.isna(m.away_score) else int(m.away_score),
            "home_pens": None if pd.isna(m.home_penalty_score) else int(m.home_penalty_score),
            "away_pens": None if pd.isna(m.away_penalty_score) else int(m.away_penalty_score),
            "status": m.status, "winner": w,
            "sources": BRACKET_SOURCES.get(mid),
        })
    return slots


def forecast_team_results() -> dict[str, dict]:
    """Resolve the current outcome of every team in the archived title forecast."""
    snapshots = load_forecast_history()
    if not snapshots:
        return {}
    archived_teams = {row["team"] for row in snapshots[0].get("title_odds", [])}
    remaining = set(load_remaining_teams()["team_name"])
    matches = load_wc_matches()
    knockout = matches[(matches["match_id"] >= 97) & (matches["status"] == "Completed")]
    results: dict[str, dict] = {}

    for team in archived_teams:
        played = knockout[(knockout["home_team"] == team) | (knockout["away_team"] == team)]
        if played.empty:
            continue
        match = played.sort_values("match_id").iloc[-1]
        is_home = match["home_team"] == team
        opponent = match["away_team"] if is_home else match["home_team"]
        goals_for = int(match["home_score"] if is_home else match["away_score"])
        goals_against = int(match["away_score"] if is_home else match["home_score"])
        won = goals_for > goals_against
        finalist = team in remaining
        if finalist:
            result_label = "FINALIST"
        elif match["stage_name"] == "Semi-finals":
            result_label = "SEMI-FINAL EXIT"
        else:
            result_label = "QUARTER-FINAL EXIT"
        results[team] = {
            "status": "Finalist" if finalist else "Eliminated",
            "result_label": result_label,
            "stage": match["stage_name"],
            "match_id": int(match["match_id"]),
            "opponent": opponent,
            "goals_for": goals_for,
            "goals_against": goals_against,
            "won": won,
            "result_text": (
                f"Beat {opponent} {goals_for}–{goals_against}" if won else
                f"Lost {goals_for}–{goals_against} to {opponent}"
            ),
        }
    return results
