"""Load the species/trade lexicon and match it against text in any script."""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Any

import yaml

from .config import RESOURCES


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    return re.sub(r"\s+", " ", text)


def _pattern(term: str) -> re.Pattern[str]:
    t = re.escape(norm(term)).replace(r"\ ", r"[\s\-_]*")
    # \b does not work for Devanagari/Thai combining marks; use lookarounds on word chars
    # only when the term starts/ends with an ASCII letter or digit.
    left = r"(?<![a-z0-9])" if re.match(r"[a-z0-9]", norm(term)) else ""
    right = r"(?![a-z0-9])" if re.search(r"[a-z0-9]$", norm(term)) else ""
    return re.compile(left + t + right)


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    """Curated lexicon, extended by the PMC8579131 codebook when it has been built
    (`vannetra codebook`). Codebook names go under `pmc_<lang>` keys so their
    provenance stays visible."""
    with open(RESOURCES / "lexicon.yaml", encoding="utf-8") as f:
        lex = yaml.safe_load(f)
    pmc = RESOURCES / "lexicon_pmc.yaml"
    if pmc.exists():
        extra = yaml.safe_load(pmc.read_text(encoding="utf-8")) or {}
        for gid, g in (extra.get("groups") or {}).items():
            if gid not in lex["groups"]:
                continue
            for lang, terms in (g.get("terms") or {}).items():
                lex["groups"][gid]["terms"].setdefault(f"pmc_{lang}", []).extend(terms)
            if g.get("uses"):
                lex["groups"][gid]["uses"] = g["uses"]
    return lex


@lru_cache(maxsize=1)
def codewords() -> list[dict[str, Any]]:
    path = RESOURCES / "codewords.yaml"
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("codewords", []) if path.exists() else []


def codeword_hits(text: str) -> list[dict[str, Any]]:
    """Watchlist hits. Unverified codewords only flag an item for human review;
    they never make it a case on their own."""
    t = norm(text)
    return [c for c in codewords() if _pattern(c["term"]).search(t)]


@lru_cache(maxsize=1)
def _compiled() -> dict[str, list[tuple[str, re.Pattern[str]]]]:
    lex = load()
    out: dict[str, list[tuple[str, re.Pattern[str]]]] = {}
    for gid, g in lex["groups"].items():
        pats = []
        for terms in (g.get("terms") or {}).values():
            for t in terms:
                pats.append((t, _pattern(t)))
        out[gid] = pats
    return out


def _cue_patterns(section: str) -> dict[str, list[re.Pattern[str]]]:
    lex = load()[section]
    return {k: [_pattern(t) for t in v] for k, v in lex.items()}


@lru_cache(maxsize=None)
def cues(section: str) -> dict[str, list[re.Pattern[str]]]:
    return _cue_patterns(section)


def species_groups(text: str) -> list[str]:
    t = norm(text)
    return [gid for gid, pats in _compiled().items() if any(p.search(t) for _, p in pats)]


def matched_terms(text: str) -> list[str]:
    t = norm(text)
    return sorted({term for pats in _compiled().values() for term, p in pats if p.search(t)})


def count_cues(text: str, section: str) -> dict[str, int]:
    t = norm(text)
    return {k: sum(1 for p in pats if p.search(t)) for k, pats in cues(section).items()}


def group_label(gid: str) -> str:
    return load()["groups"].get(gid, {}).get("label", gid)


def search_terms(min_len: int = 4) -> dict[str, list[str]]:
    """Terms worth sending to a search engine, per group (skips very short/ambiguous ones)."""
    lex = load()["groups"]
    return {gid: [t for terms in g["terms"].values() for t in terms if len(t) >= min_len] for gid, g in lex.items()}
