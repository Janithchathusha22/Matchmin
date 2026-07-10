"""Build the seven-team, pre-match analytics snapshot.

Run: ``uv run python -m matchmind.snapshot``
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .data import DATASET_DIR, load_wc_matches


OUTPUT = DATASET_DIR / "remaining_team_snapshot.csv"


def _winner(row) -> str | None:
    if row.status != "Completed" or pd.isna(row.home_score):
        return None
    if int(row.home_score) != int(row.away_score):
        return row.home_team if row.home_score > row.away_score else row.away_team
    if not pd.isna(row.home_penalty_score):
        return row.home_team if row.home_penalty_score > row.away_penalty_score else row.away_team
    return None


def build_snapshot() -> pd.DataFrame:
    remaining = pd.read_csv(DATASET_DIR / "remaining_teams.csv")
    matches = load_wc_matches()
    detailed = pd.read_csv(DATASET_DIR / "matches.csv")
    stats = pd.read_csv(DATASET_DIR / "match_team_stats.csv")

    # Map raw xG onto the normalized match view without converting unknowns to 0.
    xg = detailed.set_index("match_id")[["home_xg", "away_xg"]]
    next_fixtures = matches[(matches["status"] == "Scheduled") &
                            matches["home_team"].notna() & matches["away_team"].notna()]
    rows = []
    for team in remaining.itertuples():
        played = matches[((matches.home_team == team.team_name) |
                          (matches.away_team == team.team_name)) &
                         (matches.status == "Completed")].copy()
        played = played.sort_values("date")
        form_points, gf, ga, xgf, xga = [], [], [], [], []
        for m in played.itertuples():
            home = m.home_team == team.team_name
            goals_for = int(m.home_score if home else m.away_score)
            goals_against = int(m.away_score if home else m.home_score)
            win = _winner(m)
            gf.append(goals_for); ga.append(goals_against)
            form_points.append(3 if win == team.team_name else (1 if goals_for == goals_against and win is None else 0))
            if m.match_id in xg.index:
                raw_for = xg.loc[m.match_id, "home_xg" if home else "away_xg"]
                raw_against = xg.loc[m.match_id, "away_xg" if home else "home_xg"]
                if not pd.isna(raw_for): xgf.append(float(raw_for))
                if not pd.isna(raw_against): xga.append(float(raw_against))

        team_stats = stats[stats.team_id == team.team_id]
        fixture = next_fixtures[(next_fixtures.home_team == team.team_name) |
                                (next_fixtures.away_team == team.team_name)]
        next_date = fixture.iloc[0].date if not fixture.empty else None
        rest = ((pd.Timestamp(next_date) - pd.Timestamp(played.iloc[-1].date)).days
                if next_date and not played.empty else np.nan)
        n = max(len(played), 1)
        rows.append({
            "team_id": int(team.team_id), "team_name": team.team_name,
            "fifa_code": team.fifa_code, "image_path": team.image_path,
            "tournament_status": team.tournament_status,
            "fifa_rank": int(team.fifa_rank_pre_tournament), "elo_rating": int(team.elo_rating),
            "matches_played": len(played), "wins": sum(p == 3 for p in form_points),
            "draws": sum(p == 1 for p in form_points), "losses": sum(p == 0 for p in form_points),
            "form_points_per_match": round(sum(form_points[-5:]) / max(len(form_points[-5:]), 1), 3),
            "goals_for_per_match": round(sum(gf) / n, 3),
            "goals_against_per_match": round(sum(ga) / n, 3),
            "verified_xg_for_per_match": round(float(np.mean(xgf)), 3) if xgf else np.nan,
            "verified_xg_against_per_match": round(float(np.mean(xga)), 3) if xga else np.nan,
            "avg_possession": round(float(team_stats.possession_pct.mean()), 2) if not team_stats.empty else np.nan,
            "avg_shots": round(float(team_stats.total_shots.mean()), 2) if not team_stats.empty else np.nan,
            "avg_shots_on_target": round(float(team_stats.shots_on_target.mean()), 2) if not team_stats.empty else np.nan,
            "rest_days_before_next_match": rest,
            "next_match_id": int(fixture.iloc[0].match_id) if not fixture.empty else np.nan,
            "verified_as_of": team.verified_as_of,
        })
    return pd.DataFrame(rows)


def main() -> None:
    frame = build_snapshot()
    frame.to_csv(OUTPUT, index=False)
    print(f"Wrote {len(frame)} contender snapshots to {OUTPUT}")


if __name__ == "__main__":
    main()
