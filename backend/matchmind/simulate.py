"""Monte Carlo simulation of the remaining WC2026 bracket.

Run:  uv run python -m matchmind.simulate
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import joblib
import numpy as np

from .data import (ARTIFACTS_DIR, DATASET_DIR, bracket_state, build_wc_features,
                   current_match_features, data_fingerprint, load_remaining_teams,
                   load_teams)
from .poisson import knockout_advance_probability, top_scorelines

N_RUNS = 200_000
AS_OF = "2026-07-16"
# Semi-final feeders (QF match ids) and their downstream slots
SIM_ORDER = [95, 96, 97, 98, 99, 100, 101, 102, 103, 104]


def load_best_model():
    metrics = json.loads((ARTIFACTS_DIR / "metrics.json").read_text())
    models = joblib.load(ARTIFACTS_DIR / "models.joblib")
    strengths = json.loads((ARTIFACTS_DIR / "poisson.json").read_text())
    return models[metrics["best_model"]], metrics["best_model"], strengths


def ko_win_prob(model, form, strengths, elo, home: str, away: str) -> float:
    """P(home advances) through 90m, extra time, then a bounded shootout model."""
    X = current_match_features(home, away, knockout=True, form=form)
    p_90 = model.predict_proba(X)[0]
    return knockout_advance_probability(
        p_90, strengths, home, away, elo[home], elo[away])["home"]


def simulate(n_runs: int = N_RUNS, seed: int = 42) -> dict:
    model, model_name, strengths = load_best_model()
    _, _, _, form = build_wc_features()
    slots = {s["match_id"]: s for s in bracket_state()}
    elo = load_teams().set_index("team_name")["elo_rating"].to_dict()
    remaining = set(load_remaining_teams()["team_name"])

    prob_cache: dict[tuple[str, str], float] = {}

    def advance_prob(home: str, away: str) -> float:
        key = (home, away)
        if key not in prob_cache:
            prob_cache[key] = ko_win_prob(model, form, strengths, elo, home, away)
        return prob_cache[key]

    # Pre-resolve every pairing that can occur by walking the bracket once per run
    rng = np.random.default_rng(seed)
    alive_counts: dict[str, dict[str, int]] = {}
    stage_keys = {95: "r16", 96: "r16", 97: "qf", 98: "qf", 99: "qf", 100: "qf",
                  101: "sf", 102: "sf", 103: "third", 104: "final"}

    def record(team: str, key: str) -> None:
        alive_counts.setdefault(team, {"qf": 0, "sf": 0, "final": 0, "champion": 0, "third": 0})
        if key in alive_counts.get(team, {}):
            alive_counts[team][key] += 1

    for _ in range(n_runs):
        winners: dict[int, str] = {}
        losers: dict[int, str] = {}
        for mid in SIM_ORDER:
            s = slots[mid]
            if s["winner"]:  # already played in reality
                winners[mid] = s["winner"]
                losers[mid] = s["away"] if s["winner"] == s["home"] else s["home"]
                continue
            home, away = s["home"], s["away"]
            if home is None or away is None:
                src_h, src_a = s["sources"]
                home = home or (winners.get(int(src_h[1:])) if src_h[0] == "W"
                                else losers.get(int(src_h[1:])))
                away = away or (winners.get(int(src_a[1:])) if src_a[0] == "W"
                                else losers.get(int(src_a[1:])))
            p = advance_prob(home, away)
            w = home if rng.random() < p else away
            winners[mid] = w
            losers[mid] = away if w == home else home
        for mid in (97, 98, 99, 100):
            for t in (winners[mid], losers[mid]):
                record(t, "qf")
        for mid in (101, 102):
            for t in (winners[mid], losers[mid]):
                record(t, "sf")
        record(winners[104], "final"); record(losers[104], "final")
        record(winners[104], "champion")
        record(winners[103], "third")

    table = [
        {"team": team,
         "reach_qf": round(c["qf"] / n_runs, 4),
         "reach_sf": round(c["sf"] / n_runs, 4),
         "reach_final": round(c["final"] / n_runs, 4),
         "champion": round(c["champion"] / n_runs, 4)}
        for team, c in alive_counts.items() if team in remaining
    ]
    table.sort(key=lambda r: r["champion"], reverse=True)

    # Per-fixture predictions (locked-in picks) for still-unplayed matches
    fixtures = []
    for mid in SIM_ORDER:
        s = slots[mid]
        if s["winner"] or s["home"] is None or s["away"] is None:
            continue
        X = current_match_features(s["home"], s["away"], knockout=True, form=form)
        p_h, p_d, p_a = model.predict_proba(X)[0]
        advance = knockout_advance_probability(
            (p_h, p_d, p_a), strengths, s["home"], s["away"],
            elo[s["home"]], elo[s["away"]])
        fixtures.append({
            "match_id": mid, "date": s["date"], "stage": s["stage"],
            "home": s["home"], "away": s["away"],
            "probs": {"H": round(float(p_h), 3), "D": round(float(p_d), 3),
                      "A": round(float(p_a), 3)},
            "advance_prob_home": round(advance["home"], 4),
            "extra_time": {k: round(v, 4) for k, v in advance["extra_time"].items()},
            "penalty_home": round(advance["penalty_home"], 4),
            "top_scorelines": top_scorelines(strengths, s["home"], s["away"], n=5),
            "pick": s["home"] if advance["home"] >= 0.5 else s["away"],
        })
    fixtures.sort(key=lambda item: (item["stage"] != "Final", item["date"]))

    return {"model": model_name, "runs": n_runs,
            "as_of": AS_OF, "data_fingerprint": data_fingerprint(),
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "title_odds": table,
            "upcoming": fixtures, "bracket": list(slots.values())}


def merge_prediction_history(previous: dict, slots: list[dict]) -> list[dict]:
    """Keep pre-match calls immutable and attach results once fixtures finish."""
    slot_by_id = {slot["match_id"]: slot for slot in slots}
    archived = {
        int(item["match_id"]): dict(item)
        for item in previous.get("history", [])
    }

    for prediction in previous.get("upcoming", []):
        match_id = int(prediction["match_id"])
        slot = slot_by_id.get(match_id)
        if not slot or not slot.get("winner"):
            continue
        archived.setdefault(match_id, {
            **prediction,
            "predicted_as_of": previous.get("as_of"),
            "predicted_at_utc": previous.get("generated_at_utc"),
        })

    for match_id, item in archived.items():
        slot = slot_by_id.get(match_id)
        if not slot or not slot.get("winner"):
            continue
        item.update({
            "actual_winner": slot["winner"],
            "home_score": slot["home_score"],
            "away_score": slot["away_score"],
            "home_pens": slot["home_pens"],
            "away_pens": slot["away_pens"],
            "correct": item.get("pick") == slot["winner"],
        })

    return [archived[key] for key in sorted(archived)]


def main() -> None:
    result = simulate()
    lock_path = DATASET_DIR / "locked_predictions.json"
    previous = json.loads(lock_path.read_text()) if lock_path.exists() else {}
    history = merge_prediction_history(previous, result["bracket"])
    result["prediction_history"] = history
    (ARTIFACTS_DIR / "simulation.json").write_text(json.dumps(result, indent=2))
    lock_path.write_text(json.dumps({
        "lock_type": "model_snapshot",
        "model": result["model"],
        "runs": result["runs"],
        "as_of": result["as_of"],
        "generated_at_utc": result["generated_at_utc"],
        "data_fingerprint": result["data_fingerprint"],
        "history": history,
        "upcoming": result["upcoming"],
        "title_odds": result["title_odds"],
    }, indent=2))
    print(f"Simulated {result['runs']:,} tournaments with {result['model']}")
    for row in result["title_odds"][:8]:
        print(f"  {row['team']:<15} champion {row['champion']:>6.1%}   "
              f"final {row['reach_final']:>6.1%}")


if __name__ == "__main__":
    main()
