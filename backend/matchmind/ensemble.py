"""Small, serialisable probability ensemble used by training and the API."""

from __future__ import annotations

import numpy as np


class WeightedProbabilityEnsemble:
    """Convex blend of classifiers that expose ``predict_proba``.

    Keeping this as a top-level class makes the fitted ensemble safe to persist
    with joblib and reload from the API process.
    """

    def __init__(self, models: dict[str, object], weights: dict[str, float]):
        self.models = models
        self.weights = weights
        self.classes_ = np.array([0, 1, 2])

    def predict_proba(self, X):
        result = None
        for name, model in self.models.items():
            weighted = float(self.weights[name]) * model.predict_proba(X)
            result = weighted if result is None else result + weighted
        result = np.clip(result, 1e-9, 1.0)
        return result / result.sum(axis=1, keepdims=True)

    def predict(self, X):
        return np.argmax(self.predict_proba(X), axis=1)
