"""Train and compare outcome models (Random Forest, XGBoost, Neural Net),
fit the Poisson scoreline model, and write all artifacts to backend/artifacts/.

Run:  uv run python -m matchmind.train
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, f1_score, log_loss
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from scipy.optimize import minimize
from xgboost import XGBClassifier

from .data import (ARTIFACTS_DIR, CLASSES, build_goal_dataset,
                   build_historical_features, build_wc_features,
                   data_fingerprint)
from .ensemble import WeightedProbabilityEnsemble
from .poisson import fit_poisson_strengths

LABEL_TO_INT = {c: i for i, c in enumerate(CLASSES)}


def make_models() -> dict:
    return {
        "baseline_elo_logreg": Pipeline([
            ("scale", StandardScaler()),
            ("clf", LogisticRegression(max_iter=2000, C=0.5)),
        ]),
        "random_forest": RandomForestClassifier(
            n_estimators=500, max_depth=6, min_samples_leaf=8, random_state=42),
        "xgboost": XGBClassifier(
            n_estimators=350, max_depth=3, learning_rate=0.05,
            subsample=0.8, colsample_bytree=0.8, reg_lambda=2.0,
            objective="multi:softprob", eval_metric="mlogloss", random_state=42),
        "neural_network": Pipeline([
            ("scale", StandardScaler()),
            ("clf", MLPClassifier(hidden_layer_sizes=(64, 32), alpha=1e-2,
                                  max_iter=2000, early_stopping=True, random_state=42)),
        ]),
    }


def evaluate(model, X, y_int) -> dict:
    proba = model.predict_proba(X)
    return evaluate_proba(proba, y_int)


def evaluate_proba(proba, y_int) -> dict:
    pred = np.argmax(proba, axis=1)
    onehot = np.eye(3)[y_int]
    brier = float(np.mean(np.sum((proba - onehot) ** 2, axis=1)))
    return {
        "accuracy": round(float(accuracy_score(y_int, pred)), 4),
        "log_loss": round(float(log_loss(y_int, proba, labels=[0, 1, 2])), 4),
        "brier": round(brier, 4),
        "f1_macro": round(float(f1_score(y_int, pred, average="macro")), 4),
    }


def fit_blend_weights(probabilities: dict[str, np.ndarray], y_int) -> dict[str, float]:
    """Fit non-negative validation-only weights that sum to one."""
    names = list(probabilities)
    stack = np.stack([probabilities[name] for name in names], axis=0)

    def objective(w):
        blended = np.tensordot(w, stack, axes=(0, 0))
        return log_loss(y_int, np.clip(blended, 1e-9, 1.0), labels=[0, 1, 2])

    start = np.full(len(names), 1.0 / len(names))
    result = minimize(objective, start, method="SLSQP",
                      bounds=[(0.0, 1.0)] * len(names),
                      constraints={"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},
                      options={"maxiter": 500, "ftol": 1e-10})
    weights = result.x if result.success else start
    weights = np.maximum(weights, 0.0)
    weights = weights / weights.sum()
    return {name: round(float(weights[i]), 8) for i, name in enumerate(names)}


def main() -> None:
    ARTIFACTS_DIR.mkdir(exist_ok=True)

    print("Building features...")
    X_hist, y_hist, _ = build_historical_features()
    X_wc, y_wc, wc_meta, _ = build_wc_features()
    y_hist_int = y_hist.map(LABEL_TO_INT).to_numpy()
    y_wc_int = y_wc.map(LABEL_TO_INT).to_numpy()

    # Time-ordered split within the historical data for model selection
    n_train = int(len(X_hist) * 0.8)
    X_tr, y_tr = X_hist.iloc[:n_train], y_hist_int[:n_train]
    X_val, y_val = X_hist.iloc[n_train:], y_hist_int[n_train:]

    metrics: dict[str, dict] = {}
    fitted: dict[str, object] = {}
    val_probabilities: dict[str, np.ndarray] = {}
    for name in make_models():
        print(f"Training and calibrating {name}...")
        selector = CalibratedClassifierCV(make_models()[name], method="sigmoid", cv=5)
        selector.fit(X_tr, y_tr)
        val_probabilities[name] = selector.predict_proba(X_val)
        val_metrics = evaluate_proba(val_probabilities[name], y_val)

        # The live tournament is reporting-only. Production fits on historical
        # data, but model choice and blend weights never inspect WC2026 labels.
        production = CalibratedClassifierCV(make_models()[name], method="sigmoid", cv=5)
        production.fit(X_hist, y_hist_int)
        wc_metrics = evaluate(production, X_wc, y_wc_int)
        metrics[name] = {"validation": val_metrics, "wc2026_live": wc_metrics}
        fitted[name] = production
        print(f"  val logloss={val_metrics['log_loss']}  WC2026 report acc={wc_metrics['accuracy']}")

    weights = fit_blend_weights(val_probabilities, y_val)
    val_blend = sum(weights[name] * val_probabilities[name] for name in weights)
    ensemble = WeightedProbabilityEnsemble(dict(fitted), weights)
    best = "weighted_ensemble"
    metrics[best] = {
        "validation": evaluate_proba(val_blend, y_val),
        "wc2026_live": evaluate(ensemble, X_wc, y_wc_int),
    }
    fitted[best] = ensemble
    print(f"Production model: {best} {weights}")

    print("Fitting Poisson scoreline model...")
    strengths = fit_poisson_strengths(build_goal_dataset())

    # Live accuracy scoreboard: best model's calls vs every completed WC2026 match
    proba = ensemble.predict_proba(X_wc)
    scoreboard = []
    correct = 0
    for i, m in enumerate(wc_meta.to_dict("records")):
        pick = CLASSES[int(np.argmax(proba[i]))]
        actual = y_wc.iloc[i]
        correct += int(pick == actual)
        scoreboard.append({**m, "predicted": pick, "actual": actual,
                           "correct": pick == actual,
                           "probs": {"H": round(float(proba[i][0]), 3),
                                     "D": round(float(proba[i][1]), 3),
                                     "A": round(float(proba[i][2]), 3)},
                           "running_accuracy": round(correct / (i + 1), 4)})

    joblib.dump({name: m for name, m in fitted.items()}, ARTIFACTS_DIR / "models.joblib")
    (ARTIFACTS_DIR / "metrics.json").write_text(json.dumps({
        "best_model": best,
        "production_selection": "Convex ensemble weights fitted on historical validation log-loss; WC2026 excluded from selection",
        "ensemble_weights": weights,
        "n_train_historical": len(X_hist),
        "n_model_selection_train": len(X_tr),
        "n_model_selection_validation": len(X_val),
        "n_live_wc2026": len(X_wc),
        "feature_baseline": {name: round(float(X_hist[name].mean()), 6) for name in X_hist.columns},
        "data_fingerprint": data_fingerprint(),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "historical_data_limitations": "The legacy 600-match file has no dates or source lineage; file order is used until a verified dated archive replaces it.",
        "models": metrics,
    }, indent=2))
    (ARTIFACTS_DIR / "poisson.json").write_text(json.dumps(strengths, indent=2))
    (ARTIFACTS_DIR / "accuracy.json").write_text(json.dumps({
        "model": best,
        "matches_scored": len(scoreboard),
        "correct": correct,
        "accuracy": round(correct / max(len(scoreboard), 1), 4),
        "matches": scoreboard,
    }, indent=2))
    print(f"Artifacts written to {ARTIFACTS_DIR}")
    print(f"Live WC2026 scoreboard: {correct}/{len(scoreboard)} "
          f"({correct / max(len(scoreboard), 1):.1%})")


if __name__ == "__main__":
    main()
