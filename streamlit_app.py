"""MatchMind — Streamlit demo for the FIFA World Cup 2026 prediction model.

Deploy on Streamlit Community Cloud with:
  Main file path: streamlit_app.py
  Requirements:   requirements.txt   (repo root)

Reuses the existing backend/matchmind package directly (no FastAPI server
needed) — loads the lightweight calibrated logistic-regression model
(backend/artifacts/streamlit_model.joblib) instead of the full multi-model
bundle so the cloud requirements stay small (no xgboost/torch).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent / "backend"))

from matchmind.data import ARTIFACTS_DIR, FEATURE_NAMES, current_match_features, load_teams
from matchmind.explain import exact_baseline_shapley
from matchmind.poisson import knockout_advance_probability, poisson_outcome_probs, top_scorelines

st.set_page_config(page_title="MatchMind — WC2026 Predictor", page_icon="⚽", layout="wide")


@st.cache_resource
def load_artifacts() -> dict:
    return {
        "model": joblib.load(ARTIFACTS_DIR / "streamlit_model.joblib"),
        "poisson": json.loads((ARTIFACTS_DIR / "poisson.json").read_text()),
        "metrics": json.loads((ARTIFACTS_DIR / "metrics.json").read_text()),
        "simulation": json.loads((ARTIFACTS_DIR / "simulation.json").read_text()),
    }


@st.cache_resource
def load_form():
    from matchmind.data import build_wc_features
    *_, form = build_wc_features()
    return form


@st.cache_data
def load_team_table() -> pd.DataFrame:
    return load_teams()


art = load_artifacts()
form = load_form()
teams_df = load_team_table()
team_names = sorted(teams_df["team_name"])
elo = teams_df.set_index("team_name")["elo_rating"].to_dict()

st.title("⚽ MatchMind — FIFA World Cup 2026 Predictor")
st.caption(
    f"Model: **{art['metrics']['best_model']}** · "
    f"live WC2026 accuracy {art['metrics']['models']['weighted_ensemble']['wc2026_live']['accuracy']:.1%} · "
    f"Elo + last-5-match form, calibrated on 600 historical internationals + this tournament."
)

tab_predict, tab_odds = st.tabs(["🔮 Match Predictor", "🏆 Title Odds"])

with tab_predict:
    col_home, col_away, col_ko = st.columns([2, 2, 1])
    with col_home:
        home = st.selectbox("Home team", team_names, index=team_names.index("France") if "France" in team_names else 0)
    with col_away:
        away_options = [t for t in team_names if t != home]
        default_away = "Spain" if "Spain" in away_options else 0
        away = st.selectbox("Away team", away_options,
                            index=away_options.index(default_away) if default_away in away_options else 0)
    with col_ko:
        knockout = st.checkbox("Knockout match", value=False, help="Draws resolve via extra time + penalties")

    X = current_match_features(home, away, knockout, form=form)
    p_h, p_d, p_a = art["model"].predict_proba(X)[0]
    pois = poisson_outcome_probs(art["poisson"], home, away)

    st.subheader(f"{home} vs {away}")
    c1, c2, c3 = st.columns(3)
    c1.metric(f"{home} win", f"{p_h:.1%}")
    c2.metric("Draw", f"{p_d:.1%}")
    c3.metric(f"{away} win", f"{p_a:.1%}")

    if knockout:
        advance = knockout_advance_probability((p_h, p_d, p_a), art["poisson"], home, away, elo[home], elo[away])
        st.info(
            f"**Advance probability (incl. extra time / penalties):** "
            f"{home} {advance['home']:.1%} — {away} {1 - advance['home']:.1%}  "
            f"(penalty-shootout edge: {home} {advance['penalty_home']:.1%})"
        )

    col_score, col_explain = st.columns(2)
    with col_score:
        st.markdown("**Expected goals**")
        st.write(f"{home}: {pois['xg_home']:.2f}  ·  {away}: {pois['xg_away']:.2f}")
        st.markdown("**Most likely scorelines**")
        scorelines = top_scorelines(art["poisson"], home, away, n=6)
        st.dataframe(
            pd.DataFrame([
                {"Scoreline": f"{s['home_goals']}-{s['away_goals']}", "Probability": f"{s['prob']:.1%}"}
                for s in scorelines
            ]),
            hide_index=True, width="stretch",
        )

    with col_explain:
        st.markdown("**What's driving this prediction** (Shapley contribution to home-win probability)")
        explanation = exact_baseline_shapley(art["model"], X, art["metrics"]["feature_baseline"], knockout=False)
        exp_df = pd.DataFrame(explanation["contributions"]).set_index("feature")
        st.bar_chart(exp_df["contribution"])

with tab_odds:
    st.subheader("Title odds (Monte Carlo simulation)")
    st.caption(f"{art['simulation']['runs']:,} simulated tournaments, as of {art['simulation'].get('as_of', '—')}")
    odds_df = pd.DataFrame(art["simulation"]["title_odds"]).set_index("team")
    odds_df.columns = ["Reach QF", "Reach SF", "Reach Final", "Champion"]
    st.dataframe(odds_df.style.format("{:.1%}"), width="stretch")
    st.bar_chart(odds_df["Champion"])
