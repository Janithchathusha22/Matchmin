"""Poisson scoreline model: attack/defense strengths -> scoreline probability matrix."""

from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.linear_model import PoissonRegressor

MAX_GOALS = 8


def fit_poisson_strengths(goal_rows: pd.DataFrame) -> dict:
    """Fit log(expected goals) = mu + attack[team] - defense[opponent].

    goal_rows: columns team, opponent, goals_for (one row per team per match).
    Returns {"mu": float, "attack": {team: coef}, "defense": {team: coef}}.
    """
    att = pd.get_dummies(goal_rows["team"], prefix="att", dtype=float)
    dfn = pd.get_dummies(goal_rows["opponent"], prefix="def", dtype=float)
    X = pd.concat([att, dfn], axis=1)
    model = PoissonRegressor(alpha=0.5, max_iter=1000)
    model.fit(X, goal_rows["goals_for"])
    coefs = dict(zip(X.columns, model.coef_))
    attack = {c[len("att_"):]: v for c, v in coefs.items() if c.startswith("att_")}
    defense = {c[len("def_"):]: v for c, v in coefs.items() if c.startswith("def_")}
    return {"mu": float(model.intercept_), "attack": attack, "defense": defense}


def expected_goals(strengths: dict, team: str, opponent: str) -> float:
    mu = strengths["mu"]
    att = strengths["attack"].get(team, 0.0)
    dfn = strengths["defense"].get(opponent, 0.0)
    return float(np.exp(mu + att + dfn))


def scoreline_matrix(strengths: dict, home: str, away: str) -> np.ndarray:
    """(MAX_GOALS+1)x(MAX_GOALS+1) matrix of P(home=i, away=j)."""
    lam_h = expected_goals(strengths, home, away)
    lam_a = expected_goals(strengths, away, home)
    goals = np.arange(MAX_GOALS + 1)
    ph = poisson.pmf(goals, lam_h)
    pa = poisson.pmf(goals, lam_a)
    return np.outer(ph, pa)


def _outcomes_from_lambdas(lam_h: float, lam_a: float) -> dict:
    goals = np.arange(MAX_GOALS + 1)
    mat = np.outer(poisson.pmf(goals, lam_h), poisson.pmf(goals, lam_a))
    total = max(float(mat.sum()), 1e-12)
    return {
        "home": float(np.tril(mat, -1).sum()) / total,
        "draw": float(np.trace(mat)) / total,
        "away": float(np.triu(mat, 1).sum()) / total,
    }


def knockout_advance_probability(p_90: tuple[float, float, float] | np.ndarray,
                                 strengths: dict, home: str, away: str,
                                 elo_home: float, elo_away: float) -> dict:
    """Resolve a knockout draw through an explicit extra-time/penalty branch.

    Extra time uses one third of the fitted 90-minute scoring intensities.
    Shootouts remain close to 50/50; Elo only supplies a deliberately bounded
    adjustment because team strength is a weak proxy for penalty skill.
    """
    p_h, p_d, p_a = (float(v) for v in p_90)
    et = _outcomes_from_lambdas(
        expected_goals(strengths, home, away) / 3.0,
        expected_goals(strengths, away, home) / 3.0,
    )
    penalty_home = 1.0 / (1.0 + 10.0 ** (-(float(elo_home) - float(elo_away)) / 800.0))
    penalty_home = float(np.clip(penalty_home, 0.40, 0.60))
    home_given_draw = et["home"] + et["draw"] * penalty_home
    home_advance = p_h + p_d * home_given_draw
    return {
        "home": float(np.clip(home_advance, 0.0, 1.0)),
        "extra_time": et,
        "penalty_home": penalty_home,
        "home_given_90m_draw": home_given_draw,
    }


def top_scorelines(strengths: dict, home: str, away: str, n: int = 5) -> list[dict]:
    mat = scoreline_matrix(strengths, home, away)
    flat = [(int(i), int(j), float(mat[i, j]))
            for i in range(mat.shape[0]) for j in range(mat.shape[1])]
    flat.sort(key=lambda t: t[2], reverse=True)
    return [{"home_goals": i, "away_goals": j, "prob": round(p, 4)} for i, j, p in flat[:n]]


def poisson_outcome_probs(strengths: dict, home: str, away: str) -> dict:
    mat = scoreline_matrix(strengths, home, away)
    total = max(float(mat.sum()), 1e-12)
    return {
        "home": float(np.tril(mat, -1).sum()) / total,
        "draw": float(np.trace(mat)) / total,
        "away": float(np.triu(mat, 1).sum()) / total,
        "xg_home": expected_goals(strengths, home, away),
        "xg_away": expected_goals(strengths, away, home),
    }
