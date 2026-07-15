"""Export API-shaped static JSON for Vercel frontend fallback.

The React app still prefers the live FastAPI backend. These files keep the
deployed site usable when the backend is not reachable or when Vercel is
configured with `frontend` as the project root.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
OUT = ROOT / "frontend" / "public" / "static-api"

sys.path.insert(0, str(BACKEND))

from matchmind.data import (  # noqa: E402
    FEATURE_NAMES,
    bracket_state,
    build_wc_features,
    current_match_features,
    data_fingerprint,
    forecast_team_results,
    load_forecast_history,
    load_remaining_snapshot,
    load_remaining_teams,
    load_teams,
    load_wc_matches,
)


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean(v) for v in value]
    if isinstance(value, tuple):
        return [clean(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, float) and np.isnan(value):
        return None
    return value


def write_json(name: str, data) -> None:
    (OUT / name).write_text(
        json.dumps(clean(data), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def export_model() -> dict:
    model = joblib.load(BACKEND / "artifacts" / "streamlit_model.joblib")
    classifiers = []
    for calibrated in model.calibrated_classifiers_:
        pipeline = calibrated.estimator
        scaler = pipeline.named_steps["scale"]
        clf = pipeline.named_steps["clf"]
        classifiers.append(
            {
                "mean": scaler.mean_.tolist(),
                "scale": scaler.scale_.tolist(),
                "coef": clf.coef_.tolist(),
                "intercept": clf.intercept_.tolist(),
                "calibrators": [
                    {"a": float(cal.a_), "b": float(cal.b_)}
                    for cal in calibrated.calibrators
                ],
            }
        )
    return {
        "feature_names": FEATURE_NAMES,
        "classes": ["H", "D", "A"],
        "classifiers": classifiers,
    }


def export_teams(simulation: dict) -> list[dict]:
    teams = load_teams()
    odds = {row["team"]: row for row in simulation["title_odds"]}
    remaining = load_remaining_teams().set_index("team_name").to_dict("index")
    forecast_history = load_forecast_history()
    archived_snapshot = forecast_history[0] if forecast_history else {}
    archived_odds = {row["team"]: row for row in archived_snapshot.get("title_odds", [])}
    archived_results = forecast_team_results()
    rows = []
    for team in teams.itertuples():
        team_odds = odds.get(team.team_name, {})
        remain = remaining.get(team.team_name, {})
        rows.append(
            {
                "team_id": int(team.team_id),
                "name": team.team_name,
                "code": team.fifa_code,
                "group": team.group_letter,
                "confederation": team.confederation,
                "fifa_rank": int(team.fifa_ranking_pre_tournament),
                "elo": int(team.elo_rating),
                "manager": team.manager_name,
                "alive": team.team_name in remaining,
                "image": remain.get("image_path"),
                "champion_prob": team_odds.get("champion", 0.0),
                "archived_champion_prob": archived_odds.get(team.team_name, {}).get("champion"),
                "archived_forecast_as_of": archived_snapshot.get("as_of"),
                "archived_forecast_stage": archived_snapshot.get("stage"),
                "archived_result": archived_results.get(team.team_name),
            }
        )
    return sorted(rows, key=lambda row: -row["champion_prob"])


def export_contenders(simulation: dict) -> list[dict]:
    snapshot = load_remaining_snapshot().replace({np.nan: None})
    odds = {row["team"]: row for row in simulation["title_odds"]}
    rows = []
    for row in snapshot.to_dict("records"):
        row["odds"] = odds.get(row["team_name"], {})
        rows.append(row)
    return sorted(rows, key=lambda row: -row["odds"].get("champion", 0.0))


def export_team_profiles(simulation: dict) -> dict[str, dict]:
    teams = load_teams()
    matches = load_wc_matches()
    sim_odds = {row["team"]: row for row in simulation["title_odds"]}
    remaining = load_remaining_teams()
    forecast_history = load_forecast_history()
    archived_snapshot = forecast_history[0] if forecast_history else {}
    archived_odds = {row["team"]: row for row in archived_snapshot.get("title_odds", [])}
    archived_results = forecast_team_results()
    profiles = {}
    for _, team in teams.iterrows():
        played = matches[
            ((matches["home_team"] == team["team_name"]) | (matches["away_team"] == team["team_name"]))
            & (matches["status"] == "Completed")
        ]
        games = []
        for match in played.itertuples():
            is_home = match.home_team == team["team_name"]
            gf = int(match.home_score if is_home else match.away_score)
            ga = int(match.away_score if is_home else match.home_score)
            games.append(
                {
                    "match_id": int(match.match_id),
                    "date": match.date,
                    "stage": match.stage_name,
                    "opponent": match.away_team if is_home else match.home_team,
                    "gf": gf,
                    "ga": ga,
                    "result": "W" if gf > ga else ("L" if ga > gf else "D"),
                }
            )
        contender = remaining[remaining["team_name"] == team["team_name"]]
        team_archive = archived_odds.get(team["team_name"])
        image = (contender.iloc[0]["image_path"] if not contender.empty else
                 (f"/teams/{team['fifa_code']}.jpeg" if team_archive else None))
        profiles[team["team_name"]] = {
            "name": team["team_name"],
            "code": team["fifa_code"],
            "group": team["group_letter"],
            "confederation": team["confederation"],
            "elo": int(team["elo_rating"]),
            "fifa_rank": int(team["fifa_ranking_pre_tournament"]),
            "manager": team["manager_name"],
            "matches": games,
            "alive": not contender.empty,
            "image": image,
            "odds": sim_odds.get(team["team_name"]),
            "archived_odds": team_archive,
            "archived_result": archived_results.get(team["team_name"]),
            "archived_forecast_as_of": archived_snapshot.get("as_of") if team_archive else None,
            "archived_forecast_stage": archived_snapshot.get("stage") if team_archive else None,
        }
    return profiles


def export_form_state() -> dict:
    *_, form = build_wc_features()
    teams = load_teams()
    rows = {}
    for team in teams["team_name"]:
        winrate, goals_for, goals_against = form.features(team)
        rows[team] = {
            "winrate5": round(float(winrate), 6),
            "goals_for5": round(float(goals_for), 6),
            "goals_against5": round(float(goals_against), 6),
        }
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    artifacts = BACKEND / "artifacts"
    metrics = json.loads((artifacts / "metrics.json").read_text(encoding="utf-8"))
    accuracy = json.loads((artifacts / "accuracy.json").read_text(encoding="utf-8"))
    simulation_raw = json.loads((artifacts / "simulation.json").read_text(encoding="utf-8"))
    poisson = json.loads((artifacts / "poisson.json").read_text(encoding="utf-8"))
    network = json.loads((artifacts / "network.json").read_text(encoding="utf-8"))

    simulation = {
        "model": simulation_raw["model"],
        "runs": simulation_raw["runs"],
        "as_of": simulation_raw.get("as_of"),
        "generated_at_utc": simulation_raw.get("generated_at_utc"),
        "artifacts_fresh": simulation_raw.get("data_fingerprint") == data_fingerprint(),
        "title_odds": simulation_raw["title_odds"],
        "upcoming": simulation_raw["upcoming"],
        "prediction_history": simulation_raw.get("prediction_history", []),
    }
    bracket = {
        "slots": bracket_state(),
        "predictions": simulation_raw["upcoming"],
        "prediction_history": simulation_raw.get("prediction_history", []),
        "as_of": simulation_raw.get("as_of"),
        "artifacts_fresh": simulation_raw.get("data_fingerprint") == data_fingerprint(),
    }
    health = {
        "status": "static-fallback",
        "version": "static",
        "model": metrics["best_model"],
        "data_fingerprint": data_fingerprint(),
        "artifacts_fresh": metrics.get("data_fingerprint") == data_fingerprint(),
    }

    write_json("health.json", health)
    write_json("simulate.json", simulation)
    write_json("accuracy.json", accuracy)
    write_json("contenders.json", export_contenders(simulation))
    write_json("teams.json", export_teams(simulation))
    write_json("team-profiles.json", export_team_profiles(simulation))
    write_json("bracket.json", bracket)
    write_json("network.json", network)
    write_json("metrics.json", metrics)
    write_json("poisson.json", poisson)
    write_json("form.json", export_form_state())
    write_json("model.json", export_model())


if __name__ == "__main__":
    main()
