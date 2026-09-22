"""RSS/Atom feeds listed in resources/sources.yaml, plus opt-in Google News RSS search.

Only the standard library parses XML, so no extra dependency is needed.
"""
from __future__ import annotations

import email.utils
import re
import xml.etree.ElementTree as ET
from urllib.parse import quote_plus, urlparse

import yaml

from .. import lexicon
from ..config import RESOURCES
from ..schema import Record
from .base import get

_TAG = re.compile(r"<[^>]+>")


def _date(s: str) -> str:
    if not s:
        return ""
    try:
        return email.utils.parsedate_to_datetime(s).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return s[:10] if re.match(r"\d{4}-\d{2}-\d{2}", s) else ""


def parse(xml: bytes, source: str, country: str = "", kind: str = "news", query: str = "") -> list[Record]:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    ns = {"a": "http://www.w3.org/2005/Atom"}
    items = root.findall(".//item") or root.findall(".//a:entry", ns)
    out = []
    for it in items:
        def t(tag):
            el = it.find(tag) if not tag.startswith("a:") else it.find(tag, ns)
            return (el.text or "").strip() if el is not None and el.text else ""
        link = t("link")
        if not link:
            el = it.find("a:link", ns)
            link = el.get("href", "") if el is not None else ""
        src_el = it.find("source")
        outlet = (src_el.text or "").strip() if src_el is not None and src_el.text else urlparse(link).netloc
        desc = _TAG.sub(" ", t("description") or t("a:summary"))
        out.append(Record(url=link, title=t("title") or t("a:title"), text=desc.strip(), source=source,
                          outlet=outlet, published=_date(t("pubDate") or t("a:updated")),
                          country_hint=country, kind=kind, query=query))
    return out


def registry() -> dict:
    with open(RESOURCES / "sources.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def collect_feeds() -> list[Record]:
    recs = []
    for s in registry().get("sources", []):
        if s.get("access") != "rss" or not s.get("enabled", True) or not s.get("feed"):
            continue
        r = get(s["feed"])
        got = parse(r.content, s["id"], s.get("country", ""), s.get("kind", "news")) if r is not None and r.ok else []
        # Official feeds carry everything a ministry publishes; keep wildlife items only.
        got = [x for x in got if lexicon.species_groups(x.title + " " + x.text)
               or re.search(r"wildlife|forest|poach|smuggl|cites", x.title + x.text, re.I)]
        print(f"  feed {s['id']}: {len(got)} wildlife items")
        recs += got
    return recs


GNEWS_EDITIONS = {  # edition: (hl, gl, ceid, lexicon language key)
    # South & Southeast Asia
    "IN": ("en-IN", "IN", "IN:en", "en"), "IN-hi": ("hi", "IN", "IN:hi", "hi"),
    "TH": ("en", "TH", "TH:en", "en"), "VN": ("vi", "VN", "VN:vi", "vi"), "ID": ("id", "ID", "ID:id", "id_ms"),
    "MY": ("en-MY", "MY", "MY:en", "en"), "PH": ("en-PH", "PH", "PH:en", "en"), "SG": ("en-SG", "SG", "SG:en", "en"),
    # Africa (source and transit)
    "ZA": ("en-ZA", "ZA", "ZA:en", "en"), "NG": ("en-NG", "NG", "NG:en", "en"), "KE": ("en-KE", "KE", "KE:en", "en"),
    "UG": ("en-UG", "UG", "UG:en", "en"), "SN": ("fr", "SN", "SN:fr", "fr"),
    # Latin America (source)
    "BR": ("pt-BR", "BR", "BR:pt-419", "pt"), "MX": ("es-419", "MX", "MX:es-419", "es"), "CO": ("es-419", "CO", "CO:es-419", "es"),
    "PE": ("es-419", "PE", "PE:es-419", "es"), "AR": ("es-419", "AR", "AR:es-419", "es"),
    # Demand and transit markets
    "US": ("en-US", "US", "US:en", "en"), "GB": ("en-GB", "GB", "GB:en", "en"), "FR": ("fr", "FR", "FR:fr", "fr"),
    "AU": ("en-AU", "AU", "AU:en", "en"), "HK": ("en-HK", "HK", "HK:en", "en"),
}
LOCAL_CUES = {
    "en": "(seized OR arrested OR smuggling OR trafficking)", "hi": "(जब्त OR गिरफ्तार OR तस्करी)",
    "vi": "(bắt giữ OR buôn lậu)", "id_ms": "(disita OR ditangkap OR penyelundupan)",
    "pt": "(apreensão OR apreendidos OR resgata OR tráfico)", "es": "(decomiso OR incautan OR detenidos OR tráfico)",
    "fr": "(saisie OR arrêtés OR trafic)",
}


def collect_gnews(editions: list[str] | None = None, when: str = "30d") -> list[Record]:
    """Google News RSS search. OPT-IN: Google's feed terms allow personal,
    non-commercial use only. Enable deliberately (``--gnews``) for research runs,
    and publish only derived facts (event, species, place), never the feed itself.
    Each edition is searched in its own language where the lexicon has terms."""
    recs = []
    lex = lexicon.load()["groups"]
    for ed in editions or ["IN"]:
        hl, gl, ceid, lang = GNEWS_EDITIONS[ed]
        cue = LOCAL_CUES.get(lang, LOCAL_CUES["en"])
        for gid, g in lex.items():
            local = [t for t in (g["terms"].get(lang) or []) if len(t) > 3][:3]
            if not local and lang != "en":
                continue  # nothing to say in this language: the English editions cover it
            terms = local or [t for t in g["terms"].get("en", []) if len(t) > 4][:3]
            if not terms:
                continue
            q = "(" + " OR ".join(f'"{t}"' for t in terms) + f") {cue} when:{when}"
            url = f"https://news.google.com/rss/search?q={quote_plus(q)}&hl={hl}&gl={gl}&ceid={ceid}"
            r = get(url, delay=3, check_robots=False)
            got = parse(r.content, "gnews", gl, "news", q) if r is not None and r.ok else []
            if got:
                print(f"  gnews {ed} {gid}: {len(got)}")
            recs += got
    return recs
