"""Transparent local explanations for MatchMind predictions.

With ten input features an exact baseline Shapley calculation needs only 1,024
batched model evaluations.  This avoids a heavyweight runtime dependency while
retaining the Shapley local-accuracy property for the declared baseline.
"""

from __future__ import annotations

from math import comb

import numpy as np
import pandas as pd


def _target_value(proba: np.ndarray, knockout: bool) -> np.ndarray:
    if not knockout:
        return proba[:, 0]
    non_draw = np.maximum(proba[:, 0] + proba[:, 2], 1e-9)
    return proba[:, 0] + proba[:, 1] * proba[:, 0] / non_draw


def exact_baseline_shapley(model, X: pd.DataFrame, baseline: dict[str, float],
                           knockout: bool) -> dict:
    """Explain home-win/home-advance probability against one reference row."""
    names = list(X.columns)
    n = len(names)
    observed = X.iloc[0].to_numpy(dtype=float)
    reference = np.array([float(baseline[name]) for name in names], dtype=float)

    rows = np.tile(reference, (1 << n, 1))
    for mask in range(1 << n):
        for j in range(n):
            if mask & (1 << j):
                rows[mask, j] = observed[j]
    values = _target_value(
        model.predict_proba(pd.DataFrame(rows, columns=names)), knockout)

    phi = np.zeros(n, dtype=float)
    for j in range(n):
        bit = 1 << j
        for mask in range(1 << n):
            if mask & bit:
                continue
            size = mask.bit_count()
            weight = 1.0 / (n * comb(n - 1, size))
            phi[j] += weight * (values[mask | bit] - values[mask])

    contributions = [
        {"feature": name, "value": round(float(observed[i]), 4),
         "baseline": round(float(reference[i]), 4),
         "contribution": round(float(phi[i]), 5)}
        for i, name in enumerate(names)
    ]
    contributions.sort(key=lambda row: abs(row["contribution"]), reverse=True)
    return {
        "method": "exact_baseline_shapley",
        "target": "home_advance" if knockout else "home_win_90m",
        "base_probability": round(float(values[0]), 5),
        "predicted_probability": round(float(values[-1]), 5),
        "contributions": contributions,
    }
