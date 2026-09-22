"""Feature extractors for the relevance classifier.

Text arrives mixed: English, Hindi in Devanagari, Hindi typed in Latin script,
Telugu, emojis and phone numbers. Character n-grams cope with all of that
without a tokenizer per language; word n-grams catch phrases like "for sale";
a small set of hand features encodes what investigators look for.
"""
from __future__ import annotations

import re

import numpy as np
from scipy import sparse
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion

from .. import lexicon
from ..privacy import find_pii

_URL = re.compile(r"https?://\S+")
_NUM = re.compile(r"\d+")


def clean(text: str) -> str:
    t = lexicon.norm(text)
    t = _URL.sub(" urltoken ", t)
    # Contact numbers become a token: presence matters, the number never does.
    t = re.sub(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)", " phonetoken ", t)
    t = _NUM.sub(" 0 ", t)
    return t


class CueFeatures(BaseEstimator, TransformerMixin):
    """Counts of sale cues, enforcement cues, lexicon hits, contact details, length."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        rows = []
        for t in X:
            sale = sum(lexicon.count_cues(t, "sale_cues").values())
            enf = sum(lexicon.count_cues(t, "enforcement_cues").values())
            sp = len(lexicon.species_groups(t))
            pii = len(find_pii(t))
            n = len(t)
            rows.append([
                np.log1p(sale), np.log1p(enf), np.log1p(sp), float(pii > 0),
                np.log1p(pii), np.log1p(n) / 8.0, float("?" in t),
            ])
        return sparse.csr_matrix(np.asarray(rows, dtype=float))


def tfidf_union(word: bool = True, char: bool = True, cues: bool = True) -> FeatureUnion:
    parts = []
    if word:
        parts.append(("word", TfidfVectorizer(preprocessor=clean, ngram_range=(1, 2), min_df=2,
                                              sublinear_tf=True, max_features=40000)))
    if char:
        parts.append(("char", TfidfVectorizer(preprocessor=clean, analyzer="char_wb", ngram_range=(2, 5),
                                              min_df=2, sublinear_tf=True, max_features=120000)))
    if cues:
        parts.append(("cues", CueFeatures()))
    return FeatureUnion(parts)


class SentenceEmbedder(BaseEstimator, TransformerMixin):
    """Multilingual sentence embeddings (optional; needs sentence-transformers).

    paraphrase-multilingual-MiniLM-L12-v2 covers Hindi, Telugu, Tamil, Bengali,
    Vietnamese, Thai, Indonesian and Malay, which suits the India→SE Asia scope.
    """

    def __init__(self, model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        self.model_name = model_name
        self._model = None

    def fit(self, X, y=None):
        return self

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
        return self._model

    def transform(self, X):
        emb = self._load().encode([str(x)[:1000] for x in X], batch_size=64, show_progress_bar=False,
                                  normalize_embeddings=True)
        return np.asarray(emb)

    def __getstate__(self):
        s = self.__dict__.copy()
        s["_model"] = None  # never pickle the transformer weights
        return s
