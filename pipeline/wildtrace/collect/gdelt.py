"""GDELT DOC 2.0 API: open, global news index, 65+ languages, ~3 months rolling window
for article lists (longer spans via timelines). Terms: https://www.gdeltproject.org/about.html#termsofuse
Rate limit: one request per 5 seconds.
"""
from __future__ import annotations

from datetime import datetime

from .. import lexicon
from ..schema import Record
from .base import get

API = "https://api.gdeltproject.org/api/v2/doc/doc"

# Countries covered: India first, then SE Asia and the neighbours that sit on
# the same routes. GDELT uses FIPS country codes in `sourcecountry`.
COUNTRIES = {
    "IN": "IN", "NP": "NP", "BD": "BG", "LK": "CE", "MM": "BM", "BT": "BT",
    "TH": "TH", "VN": "VM", "MY": "MY", "ID": "ID", "PH": "RP", "SG": "SN",
    "KH": "CB", "LA": "LA",
}

FIPS_TO_ISO = {"IN": "IN", "NP": "NP", "BG": "BD", "CE": "LK", "BM": "MM", "BT": "BT", "TH": "TH", "VM": "VN",
               "MY": "MY", "ID": "ID", "RP": "PH", "SN": "SG", "CB": "KH", "LA": "LA", "CH": "CN", "HK": "HK"}

ENFORCEMENT = "(seized OR smuggling OR arrested OR poaching)"


def queries(batch: int = 7) -> list[tuple[str, str]]:
    """Few, wide queries: GDELT throttles hard, so species groups are batched into
    OR-blocks (~7 terms; GDELT rejects queries over ~250 chars) instead of one request per group."""
    lex = lexicon.load()["groups"]
    terms = []
    for gid, g in lex.items():
        terms += [(gid, t) for t in g["terms"].get("en", []) if len(t) > 5 and " " in t][:2] or                  [(gid, t) for t in g["terms"].get("en", []) if len(t) > 4][:1]
    out = []
    for i in range(0, len(terms), batch):
        chunk = terms[i:i + batch]
        ors = " OR ".join(f'"{t}"' if " " in t else t for _, t in chunk)
        label = ",".join(sorted({g for g, _ in chunk}))
        out.append((label, f"({ors}) {ENFORCEMENT}"))
    return out


LAST_STATUS: dict[str, bool] = {}


def search(query: str, country: str = "IN", timespan: str = "3m", max_records: int = 250) -> list[Record]:
    q = f"{query} sourcecountry:{COUNTRIES.get(country, country)}" if country else query
    r = get(API, params={"query": q, "mode": "artlist", "format": "json", "maxrecords": max_records,
                         "timespan": timespan, "sort": "datedesc"}, delay=8, check_robots=False, retries=2,
              valid=lambda r: r.text.lstrip().startswith("{"))
    LAST_STATUS["throttled"] = r is None or r.status_code == 429
    if r is None or not r.ok or not r.text.strip().startswith("{"):
        print(f"    gdelt: no data ({getattr(r, 'status_code', 'no response')}: {(r.text[:60] if r is not None else '').strip()})")
        return []
    out = []
    for a in r.json().get("articles", []):
        d = a.get("seendate", "")
        pub = datetime.strptime(d[:8], "%Y%m%d").strftime("%Y-%m-%d") if len(d) >= 8 else ""
        out.append(Record(url=a["url"], title=a.get("title", ""), source="gdelt", outlet=a.get("domain", ""),
                          published=pub, lang=a.get("language", ""), country_hint=country or FIPS_TO_ISO.get(a.get("sourcecountry", ""), ""),
                          kind="news", query=query, extra={"sourcecountry": a.get("sourcecountry", "")}))
    return out


def collect(countries: list[str] | None = None, timespan: str = "3m") -> list[Record]:
    """India gets its own source-country pass (dense local coverage); the rest of the
    region is covered by one unfiltered pass whose results carry GDELT's source country.
    Circuit breaker: two consecutive empty/throttled answers stop the run, because
    GDELT escalates its penalty window for clients that keep knocking."""
    recs: list[Record] = []
    qs = queries()
    passes = (["IN"] if "IN" in (countries or ["IN"]) else []) + [""]
    fails = 0
    for c in passes:
        for label, q in qs:
            got = search(q, c, timespan)
            print(f"  gdelt {c or 'ALL'} [{label}]: {len(got)}")
            recs += got
            fails = fails + 1 if not got and LAST_STATUS.get("throttled") else 0
            if fails >= 2:
                print("  gdelt: throttled twice in a row; stopping. Re-run later (the index keeps ~3 months).")
                return recs
    return recs
