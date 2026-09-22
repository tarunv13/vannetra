"""Train the relevance classifier (is this post/article an illegal-wildlife-trade signal?).

Evaluation protocol, chosen so the reported numbers hold up on unseen data:

1. A group-wise 20% **test split** is locked away first. Groups are channels, so
   one seller's videos never appear on both sides. Without this, the same
   seller's near-identical titles inflate every score.
2. On the remaining 80%, every candidate model is scored with repeated
   StratifiedGroupKFold cross-validation, producing out-of-fold probabilities.
3. The decision threshold is set on those out-of-fold probabilities so that
   recall on the positive class (R) reaches the target (default 0.98), meaning
   at least 98% of true trade signals are kept. The best model is the one that
   then rejects the most irrelevant items (highest IR recall) at that threshold.
4. The winner and its threshold are scored once on the locked test split.
   That test score is the one to quote.
5. A learning curve shows whether more labels would still help. Out-of-fold
   mistakes are written to a review queue so humans can fix label noise, and
   the loop repeats (``vannetra train`` again after corrections).

Run:  python -m vannetra.cli train [--embed] [--target-recall 0.98]
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Callable

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.naive_bayes import ComplementNB
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.svm import LinearSVC

from ..config import LABELS, MODELS, ensure_dirs
from .dataset import load_labelled
from .features import SentenceEmbedder, tfidf_union


# ----------------------------------------------------------------- candidates
@dataclass
class Candidate:
    name: str
    build: Callable[[], Pipeline]
    needs_embed: bool = False


def candidates(embed: bool) -> list[Candidate]:
    c = [
        Candidate("word_lr", lambda: make_pipeline(tfidf_union(char=False, cues=False),
                                                   LogisticRegression(C=5, max_iter=3000, class_weight="balanced"))),
        Candidate("char_lr", lambda: make_pipeline(tfidf_union(word=False, cues=False),
                                                   LogisticRegression(C=10, max_iter=3000, class_weight="balanced"))),
        Candidate("union_lr", lambda: make_pipeline(tfidf_union(),
                                                    LogisticRegression(C=10, max_iter=3000, class_weight="balanced"))),
        Candidate("union_svm", lambda: make_pipeline(tfidf_union(), CalibratedClassifierCV(
            LinearSVC(C=0.5, class_weight="balanced"), cv=3, method="sigmoid"))),
        Candidate("word_cnb", lambda: make_pipeline(tfidf_union(char=False, cues=False), ComplementNB(alpha=0.3))),
    ]
    if embed:
        c.append(Candidate("embed_lr", lambda: make_pipeline(
            SentenceEmbedder(), LogisticRegression(C=2, max_iter=3000, class_weight="balanced")), needs_embed=True))
    return c


# ---------------------------------------------------------------- utilities
def threshold_for_recall(y: np.ndarray, p: np.ndarray, target: float) -> float:
    """Highest threshold whose recall on class 1 is >= target."""
    pos = np.sort(p[y == 1])
    if len(pos) == 0:
        return 0.5
    k = int(np.floor((1 - target) * len(pos)))  # number of positives we may lose
    return float(pos[k]) if k < len(pos) else float(pos[0])


def metrics_at(y: np.ndarray, p: np.ndarray, thr: float) -> dict[str, float]:
    pred = (p >= thr).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum()); fn = int(((pred == 0) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum()); fp = int(((pred == 1) & (y == 0)).sum())
    rec = tp / max(tp + fn, 1); prec = tp / max(tp + fp, 1); spec = tn / max(tn + fp, 1)
    return {
        "threshold": round(thr, 4),
        "recall_R": round(rec, 4), "precision_R": round(prec, 4), "recall_IR": round(spec, 4),
        "f1_R": round(2 * prec * rec / max(prec + rec, 1e-9), 4),
        "balanced_accuracy": round((rec + spec) / 2, 4),
        "accuracy": round((tp + tn) / max(len(y), 1), 4),
        "roc_auc": round(roc_auc_score(y, p), 4) if len(set(y)) > 1 else float("nan"),
        "pr_auc": round(average_precision_score(y, p), 4),
        "brier": round(brier_score_loss(y, p), 4),
        "tp": tp, "fn": fn, "tn": tn, "fp": fp,
    }


def oof_probs(build, X: np.ndarray, y: np.ndarray, groups: np.ndarray, folds: int, repeats: int) -> np.ndarray:
    """Mean out-of-fold P(R) over repeated group-aware CV."""
    acc = np.zeros(len(y)); cnt = np.zeros(len(y))
    for r in range(repeats):
        cv = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=100 + r)
        for tr, te in cv.split(X, y, groups):
            m = build().fit(X[tr], y[tr])
            acc[te] += m.predict_proba(X[te])[:, 1]; cnt[te] += 1
    return acc / np.maximum(cnt, 1)


def split_test(y: np.ndarray, groups: np.ndarray, seed: int = 7) -> tuple[np.ndarray, np.ndarray]:
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed)
    dev, test = next(cv.split(np.zeros(len(y)), y, groups))
    return dev, test


# ---------------------------------------------------------------------- main
def train(target_recall: float = 0.98, embed: bool = False, folds: int = 5, repeats: int = 2,
          verbose: bool = True) -> dict:
    ensure_dirs()
    t0 = time.time()
    df, conflicts = load_labelled()
    X = df["text"].to_numpy(object); y = df["y"].to_numpy(int); g = df["cv_group"].to_numpy(object)
    dev, test = split_test(y, g)
    log = print if verbose else (lambda *a, **k: None)
    log(f"data: {len(df)} items ({y.sum()} R / {(1 - y).sum()} IR), {len(set(g))} channel groups; "
        f"dev={len(dev)} test={len(test)}; conflicts held out: {conflicts['id'].nunique()}")

    results, oof = {}, {}
    for c in candidates(embed):
        s = time.time()
        p = oof_probs(c.build, X[dev], y[dev], g[dev], folds, repeats)
        thr = threshold_for_recall(y[dev], p, target_recall)
        results[c.name] = metrics_at(y[dev], p, thr); oof[c.name] = p
        log(f"  {c.name:10s} OOF@R>={target_recall:.2f}: IR-recall={results[c.name]['recall_IR']:.3f} "
            f"prec={results[c.name]['precision_R']:.3f} PR-AUC={results[c.name]['pr_auc']:.3f} ({time.time() - s:.0f}s)")

    # Soft-vote ensemble of the two strongest distinct models.
    top = sorted(results, key=lambda k: (results[k]["recall_IR"], results[k]["pr_auc"]), reverse=True)[:2]
    ens_p = np.mean([oof[k] for k in top], axis=0)
    ens_thr = threshold_for_recall(y[dev], ens_p, target_recall)
    results["ensemble:" + "+".join(top)] = metrics_at(y[dev], ens_p, ens_thr)
    oof["ensemble:" + "+".join(top)] = ens_p
    log(f"  ensemble({'+'.join(top)}) IR-recall={results['ensemble:' + '+'.join(top)]['recall_IR']:.3f}")

    best = max(results, key=lambda k: (results[k]["recall_IR"], results[k]["pr_auc"]))
    members = best.split(":", 1)[1].split("+") if best.startswith("ensemble:") else [best]
    builders = {c.name: c.build for c in candidates(embed)}
    thr = results[best]["threshold"]

    # ---- locked test split: fit on dev, score once
    test_p = np.mean([builders[m]().fit(X[dev], y[dev]).predict_proba(X[test])[:, 1] for m in members], axis=0)
    test_metrics = metrics_at(y[test], test_p, thr)
    log(f"best={best} thr={thr:.3f} | TEST: R-recall={test_metrics['recall_R']:.3f} "
        f"IR-recall={test_metrics['recall_IR']:.3f} prec={test_metrics['precision_R']:.3f} "
        f"bal-acc={test_metrics['balanced_accuracy']:.3f} ROC-AUC={test_metrics['roc_auc']:.3f}")

    # ---- learning curve on the winner (fit on a fraction of dev, score on test)
    curve = []
    rng = np.random.default_rng(0)
    for frac in (0.25, 0.5, 0.75, 1.0):
        idx = dev if frac == 1.0 else rng.choice(dev, int(frac * len(dev)), replace=False)
        if len(set(y[idx])) < 2:
            continue
        pp = np.mean([builders[m]().fit(X[idx], y[idx]).predict_proba(X[test])[:, 1] for m in members], axis=0)
        curve.append({"n_train": int(len(idx)), "pr_auc": round(average_precision_score(y[test], pp), 4),
                      "roc_auc": round(roc_auc_score(y[test], pp), 4)})
    gain = curve[-1]["roc_auc"] - curve[-2]["roc_auc"] if len(curve) > 1 else 0.0
    saturation = ("still improving: more labelled examples should help" if gain > 0.01 else
                  "plateau: gains now come from fixing label noise and adding hard negatives, not volume")

    # ---- review queue for the human-in-the-loop step
    p_best = oof[best]
    q = df.iloc[dev][["id", "url", "title", "label", "group"]].copy()
    q["p_relevant"] = p_best.round(4)
    q["reason"] = np.where((q["label"] == "R") & (p_best < thr), "missed_R",
                   np.where((q["label"] == "IR") & (p_best >= thr), "false_alarm", "uncertain"))
    q["margin"] = np.abs(p_best - thr)
    q = q[(q["reason"] != "uncertain") | (q["margin"] < 0.05)].sort_values(["reason", "margin"])
    c2 = conflicts[["id", "url", "title", "label"]].assign(reason="conflicting_labels")
    queue = pd.concat([c2, q], ignore_index=True)
    queue["new_label"] = ""
    queue.to_csv(LABELS / "review_queue.csv", index=False, encoding="utf-8")

    # ---- final model: all data, CV threshold
    final = [builders[m]().fit(X, y) for m in members]
    joblib.dump({"members": final, "threshold": thr, "names": members, "target_recall": target_recall},
                MODELS / "relevance.joblib")

    report = {
        "task": "WCS-OWT YouTube listings: R (wildlife trade signal) vs IR",
        "trained_at": time.strftime("%Y-%m-%d %H:%M"),
        "n": int(len(df)), "n_R": int(y.sum()), "n_IR": int((1 - y).sum()),
        "n_conflicts_held_out": int(conflicts["id"].nunique()),
        "protocol": f"group-wise test split 20%; {repeats}x{folds}-fold StratifiedGroupKFold on dev; "
                    f"threshold chosen for R recall >= {target_recall}",
        "target_recall": target_recall,
        "cv": results, "best": best, "test": test_metrics,
        "learning_curve": curve, "saturation": saturation,
        "baseline_2022_notebook": {"note": "single random split, title only, no group control",
                                   "recall_R": 0.97, "recall_IR": 0.43, "accuracy": 0.87},
        "review_queue": {"rows": int(len(queue)), "path": "data/labels/review_queue.csv"},
        "seconds": round(time.time() - t0, 1),
    }
    (MODELS / "relevance_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    log(f"learning curve: {curve} -> {saturation}")
    log(f"review queue: {len(queue)} rows -> data/labels/review_queue.csv")
    return report


def load_model():
    return joblib.load(MODELS / "relevance.joblib")


def predict(texts: list[str], bundle=None) -> np.ndarray:
    b = bundle or load_model()
    X = np.asarray(texts, dtype=object)
    return np.mean([m.predict_proba(X)[:, 1] for m in b["members"]], axis=0)
