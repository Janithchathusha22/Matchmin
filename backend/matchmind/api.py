"""MatchMind FastAPI app.

Run:  uv run uvicorn matchmind.api:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from __future__ import annotations

import json
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .data import (ARTIFACTS_DIR, FEATURE_NAMES, bracket_state, build_wc_features,
                   current_match_features, data_fingerprint, load_remaining_snapshot,
                   forecast_team_results, load_forecast_history, load_remaining_teams,
                   load_teams, load_wc_matches)
from .explain import exact_baseline_shapley
from .poisson import (knockout_advance_probability, poisson_outcome_probs,
                      top_scorelines)

app = FastAPI(title="MatchMind API", version=__version__,
              description="FIFA World Cup 2026 AI prediction & analytics")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class PredictRequest(BaseModel):
    home: str
    away: str
    knockout: bool = False


@lru_cache(maxsize=1)
def _artifacts() -> dict:
    metrics = json.loads((ARTIFACTS_DIR / "metrics.json").read_text())
    models = joblib.load(ARTIFACTS_DIR / "models.joblib")
    return {
        "metrics": metrics,
        "models": models,
        "model": models[metrics["best_model"]],
        "poisson": json.loads((ARTIFACTS_DIR / "poisson.json").read_text()),
        "accuracy": json.loads((ARTIFACTS_DIR / "accuracy.json").read_text()),
        "simulation": json.loads((ARTIFACTS_DIR / "simulation.json").read_text()),
        "network": json.loads((ARTIFACTS_DIR / "network.json").read_text()),
    }


@lru_cache(maxsize=1)
def _form_state():
    return build_wc_features()


@app.get("/api/health")
def health() -> dict:
    current = data_fingerprint()
    expected = _artifacts()["metrics"].get("data_fingerprint")
    return {"status": "ok", "version": __version__,
            "model": _artifacts()["metrics"]["best_model"],
            "data_fingerprint": current, "artifacts_fresh": current == expected}


@app.post("/api/predict")
def predict(req: PredictRequest) -> dict:
    art = _artifacts()
    *_, form = _form_state()
    try:
        X = current_match_features(req.home, req.away, req.knockout, form=form)
    except KeyError as e:
        raise HTTPException(404, str(e))
    p_h, p_d, p_a = art["model"].predict_proba(X)[0]
    pois = poisson_outcome_probs(art["poisson"], req.home, req.away)
    elo = load_teams().set_index("team_name")["elo_rating"].to_dict()
    advance = knockout_advance_probability(
        (p_h, p_d, p_a), art["poisson"], req.home, req.away,
        elo[req.home], elo[req.away]) if req.knockout else None

    votes = []
    for name, model in art["models"].items():
        if name == art["metrics"]["best_model"]:
            continue
        vote = model.predict_proba(X)[0]
        vote_advance = knockout_advance_probability(
            vote, art["poisson"], req.home, req.away,
            elo[req.home], elo[req.away])["home"] if req.knockout else float(vote[0])
        votes.append({"model": name, "home_probability": round(float(vote[0]), 4),
                      "home_advance": round(vote_advance, 4)})
    poisson_advance = knockout_advance_probability(
        (pois["home"], pois["draw"], pois["away"]), art["poisson"],
        req.home, req.away, elo[req.home], elo[req.away])["home"] if req.knockout else pois["home"]
    votes.append({"model": "bayesian_poisson_proxy",
                  "home_probability": round(float(pois["home"]), 4),
                  "home_advance": round(float(poisson_advance), 4)})
    vote_values = [v["home_advance"] for v in votes]
    disagreement = max(vote_values) - min(vote_values) if vote_values else 0.0
    home_target = advance["home"] if advance else float(p_h)
    confidence = ("high" if disagreement < 0.10 and abs(home_target - 0.5) >= 0.15
                  else "medium" if disagreement < 0.18 else "low")
    explanation = exact_baseline_shapley(
        art["model"], X, art["metrics"]["feature_baseline"], knockout=False)
    return {
        "home": req.home, "away": req.away, "knockout": req.knockout,
        "probs": {"home": round(float(p_h), 4), "draw": round(float(p_d), 4),
                  "away": round(float(p_a), 4)},
        "advance_prob_home": round(advance["home"], 4) if advance else None,
        "knockout_resolution": ({
            "extra_time": {k: round(v, 4) for k, v in advance["extra_time"].items()},
            "penalty_home": round(advance["penalty_home"], 4),
        } if advance else None),
        "expected_goals": {"home": round(pois["xg_home"], 2),
                           "away": round(pois["xg_away"], 2)},
        "top_scorelines": top_scorelines(art["poisson"], req.home, req.away, n=6),
        "features": dict(zip(FEATURE_NAMES, [round(float(v), 3) for v in X.iloc[0]])),
        "explanation": explanation,
        "model_votes": votes,
        "model_disagreement": round(float(disagreement), 4),
        "confidence": confidence,
        "upset_index": round(float(min(home_target, 1.0 - home_target)), 4),
        "data_as_of": art["simulation"].get("as_of"),
        "model": art["metrics"]["best_model"],
    }


@app.get("/api/teams")
def teams() -> list[dict]:
    df = load_teams()
    sim = {r["team"]: r for r in _artifacts()["simulation"]["title_odds"]}
    remaining = load_remaining_teams().set_index("team_name").to_dict("index")
    forecast_history = load_forecast_history()
    archived_snapshot = forecast_history[0] if forecast_history else {}
    archived_odds = {row["team"]: row for row in archived_snapshot.get("title_odds", [])}
    archived_results = forecast_team_results()
    out = []
    for t in df.itertuples():
        odds = sim.get(t.team_name, {})
        out.append({"team_id": int(t.team_id), "name": t.team_name, "code": t.fifa_code,
                    "group": t.group_letter, "confederation": t.confederation,
                    "fifa_rank": int(t.fifa_ranking_pre_tournament),
                    "elo": int(t.elo_rating), "manager": t.manager_name,
                    "alive": t.team_name in remaining,
                    "image": remaining.get(t.team_name, {}).get("image_path"),
                    "champion_prob": odds.get("champion", 0.0),
                    "archived_champion_prob": archived_odds.get(t.team_name, {}).get("champion"),
                    "archived_forecast_as_of": archived_snapshot.get("as_of"),
                    "archived_forecast_stage": archived_snapshot.get("stage"),
                    "archived_result": archived_results.get(t.team_name)})
    return sorted(out, key=lambda x: -x["champion_prob"])


@app.get("/api/contenders")
def contenders() -> list[dict]:
    snapshot = load_remaining_snapshot().replace({np.nan: None})
    odds = {row["team"]: row for row in _artifacts()["simulation"]["title_odds"]}
    rows = []
    for row in snapshot.to_dict("records"):
        row["odds"] = odds.get(row["team_name"], {})
        rows.append(row)
    return sorted(rows, key=lambda row: -row["odds"].get("champion", 0.0))


@app.get("/api/teams/{name}")
def team_profile(name: str) -> dict:
    df = load_teams()
    row = df[df["team_name"].str.lower() == name.lower()]
    if row.empty:
        raise HTTPException(404, f"Unknown team: {name}")
    t = row.iloc[0]
    matches = load_wc_matches()
    played = matches[((matches["home_team"] == t["team_name"]) |
                      (matches["away_team"] == t["team_name"])) &
                     (matches["status"] == "Completed")]
    games = []
    for m in played.itertuples():
        is_home = m.home_team == t["team_name"]
        gf = int(m.home_score if is_home else m.away_score)
        ga = int(m.away_score if is_home else m.home_score)
        games.append({"match_id": int(m.match_id), "date": m.date, "stage": m.stage_name,
                      "opponent": m.away_team if is_home else m.home_team,
                      "gf": gf, "ga": ga,
                      "result": "W" if gf > ga else ("L" if ga > gf else "D")})
    sim = {r["team"]: r for r in _artifacts()["simulation"]["title_odds"]}
    forecast_history = load_forecast_history()
    archived_snapshot = forecast_history[0] if forecast_history else {}
    archived_odds = {
        r["team"]: r for r in archived_snapshot.get("title_odds", [])
    }.get(t["team_name"])
    archived_result = forecast_team_results().get(t["team_name"])
    remaining = load_remaining_teams()
    contender = remaining[remaining["team_name"] == t["team_name"]]
    image = (contender.iloc[0]["image_path"] if not contender.empty else
             (f"/teams/{t['fifa_code']}.jpeg" if archived_odds else None))
    return {"name": t["team_name"], "code": t["fifa_code"], "group": t["group_letter"],
            "confederation": t["confederation"], "elo": int(t["elo_rating"]),
            "fifa_rank": int(t["fifa_ranking_pre_tournament"]),
            "manager": t["manager_name"], "matches": games,
            "alive": not contender.empty, "image": image,
            "odds": sim.get(t["team_name"]),
            "archived_odds": archived_odds,
            "archived_result": archived_result,
            "archived_forecast_as_of": archived_snapshot.get("as_of") if archived_odds else None,
            "archived_forecast_stage": archived_snapshot.get("stage") if archived_odds else None}


@app.get("/api/simulate")
def simulate() -> dict:
    sim = _artifacts()["simulation"]
    return {"model": sim["model"], "runs": sim["runs"],
            "as_of": sim.get("as_of"), "generated_at_utc": sim.get("generated_at_utc"),
            "artifacts_fresh": sim.get("data_fingerprint") == data_fingerprint(),
            "title_odds": sim["title_odds"], "upcoming": sim["upcoming"],
            "prediction_history": sim.get("prediction_history", [])}


@app.get("/api/bracket")
def bracket() -> dict:
    sim = _artifacts()["simulation"]
    return {"slots": bracket_state(), "predictions": sim["upcoming"],
            "prediction_history": sim.get("prediction_history", []),
            "as_of": sim.get("as_of"),
            "artifacts_fresh": sim.get("data_fingerprint") == data_fingerprint()}


@app.get("/api/network")
def network() -> dict:
    return _artifacts()["network"]


@app.get("/api/model/metrics")
def model_metrics() -> dict:
    return _artifacts()["metrics"]


@app.get("/api/accuracy")
def accuracy() -> dict:
    return _artifacts()["accuracy"]
