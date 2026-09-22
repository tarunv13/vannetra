"""Turn relevant records into structured enforcement events.

Rule-based on purpose: every field it fills can be traced to a phrase in the
source text, which is what a case report needs. Each event keeps the matched
phrases (``evidence``) so reviewers can check the extraction.

What is NOT extracted: names of people. Only the count of people arrested is
kept (see privacy.py).
"""
from __future__ import annotations

import csv
import re
from dataclasses import asdict, dataclass, field
from functools import lru_cache

from .. import lexicon
from ..config import RESOURCES
from ..schema import Record

WORDNUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
           "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20, "a": 1, "an": 1}
_UNIT = (r"kg|kgs|kilograms?|kilos?|g|grams?|tonnes?|tons?|quintals?|pieces|pcs|nos|numbers|skins?|scales|tusks?|"
         r"horns?|claws|nails|teeth|bones|pelts?|live|birds|parakeets|parrots|turtles|tortoises|snakes|lizards|logs|"
         r"pangolins|geckos|owls|pods|hides|carcass(?:es)?|heads|bags|boxes|sacks")
QTY = re.compile(rf"(?<![\w.])(\d{{1,3}}(?:,\d{{2,3}})+|\d+(?:\.\d+)?|{'|'.join(WORDNUM)})\s*(?:-\s*)?({_UNIT})\b", re.I)
MONEY = re.compile(r"(?:rs\.?|₹|inr|usd|us\$|\$)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs|crore|crores|million|billion|mn|cr)?", re.I)
PEOPLE = re.compile(rf"\b(\d+|{'|'.join(WORDNUM)})\s+(?:\w+\s+){{0,2}}(?:persons?|people|men|women|accused|suspects?|"
                    rf"poachers?|smugglers?|traffickers?|youths?|nationals?|individuals?)\s+(?:were\s+|are\s+)?"
                    r"(?:arrested|held|nabbed|detained|apprehended|caught|booked)", re.I)
_PN = r"[A-Z][\w]+(?:\s[A-Z][\w]+){0,3}"  # a capitalised place name, up to 4 words
# "352 pangolin scales", "4 monitor lizards": up to two words between number and unit.
QTY_GAP = re.compile(rf"(?<![\w.])(\d{{1,3}}(?:,\d{{2,3}})+|\d+(?:\.\d+)?|{'|'.join(k for k in WORDNUM if len(k) > 2)})\s+"
                     rf"(?:[A-Za-z-]+\s+){{1,2}}?({_UNIT})\b", re.I)
# "Six Arrested", "2 held", "three nabbed"
PEOPLE_SHORT = re.compile(rf"\b(\d+|{'|'.join(k for k in WORDNUM if len(k) > 2)})\s+(?:arrested|held|nabbed|detained|booked)\b", re.I)
ROUTE = re.compile(rf"\b(?:from|originating in|sourced from)\s+({_PN})\s+(?:to|towards|for|bound for|destined for)\s+({_PN})")
DEST = re.compile(rf"\b(?:bound for|destined for|en route to|meant for|to be smuggled (?:in)?to|smuggled (?:in)?to)\s+({_PN})")


AGENCY_CANON = {
    "directorate of revenue intelligence": "DRI", "wildlife crime control bureau": "WCCB",
    "forest officials": "Forest Department", "forest officers": "Forest Department", "forest department": "Forest Department",
    "special task force": "STF", "border security force": "BSF", "sashastra seema bal": "SSB",
    "railway protection force": "RPF", "police": "Police", "customs": "Customs", "crime branch": "Crime Branch",
    "coast guard": "Coast Guard", "department of national parks": "DNP (Thailand)",
}


@dataclass
class Place:
    name: str
    type: str
    country: str
    admin1: str
    lat: float
    lon: float


_WORD = re.compile(r"[A-Za-zÀ-ɏ][\w'À-ɏ-]*")


@lru_cache(maxsize=1)
def gazetteer() -> dict[str, list[Place]]:
    """name -> places. The hand-curated gazetteer.csv wins over the GeoNames
    extract (gazetteer_geonames.csv, built by `vannetra gazetteer`)."""
    index: dict[str, list[Place]] = {}
    for fname in ("gazetteer.csv", "gazetteer_geonames.csv"):
        path = RESOURCES / fname
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                p = Place(r["name"], r["type"], r["country"], r["admin1"], float(r["lat"]), float(r["lon"]))
                for n in [r["name"]] + [a for a in (r["aliases"] or "").split(";") if a]:
                    bucket = index.setdefault(n.lower(), [])
                    if fname == "gazetteer.csv" or not bucket:
                        bucket.append(p)
                    elif all(b.country != p.country for b in bucket):
                        bucket.append(p)  # same name in another country: keep for country_hint
    return index


RANK = {"airport": 0, "park": 1, "city": 2, "district": 3, "region": 4, "state": 5, "country": 6}
MAX_WORDS = 4


def find_places(text: str, country_hint: str = "") -> list[tuple[int, Place]]:
    """Gazetteer places mentioned in text, longest match first, with the offset of
    the first mention. Only capitalised spans are considered, so "star" never
    matches a town called Star."""
    idx = gazetteer()
    words = [(m.start(), m.end(), m.group(0)) for m in _WORD.finditer(text)]
    found: dict[str, tuple[int, Place]] = {}
    i = 0
    while i < len(words):
        hit = None
        for n in range(min(MAX_WORDS, len(words) - i), 0, -1):
            span = text[words[i][0]:words[i + n - 1][1]]
            if not span[0].isupper():
                break
            cands = idx.get(span.lower())
            if cands:
                pick = next((c for c in cands if c.country == country_hint), cands[0])
                hit = (n, pick)
                break
        if hit:
            n, p = hit
            if p.name not in found:
                found[p.name] = (words[i][0], p)
            i += n
        else:
            i += 1
    return sorted(found.values(), key=lambda x: x[0])


def primary_place(places: list[tuple[int, Place]], country_hint: str = "") -> Place | None:
    """Most specific place, preferring ones early in the text and inside the hinted country."""
    if not places:
        return None
    def score(item):
        pos, p = item
        return (RANK.get(p.type, 9), 0 if (not country_hint or p.country == country_hint) else 1, pos)
    # Early mentions (headline/lede) carry the event location; later ones are often context.
    early = [x for x in places if x[0] < 400] or places
    return min(early, key=score)[1]


def _num(s: str) -> float:
    s = s.lower()
    return float(WORDNUM[s]) if s in WORDNUM else float(s.replace(",", ""))


def _money_inr(amount: str, scale: str | None) -> float | None:
    try:
        v = float(amount.replace(",", ""))
    except ValueError:
        return None
    mult = {"lakh": 1e5, "lakhs": 1e5, "crore": 1e7, "crores": 1e7, "cr": 1e7, "million": 1e6, "mn": 1e6,
            "billion": 1e9}.get((scale or "").lower(), 1)
    return v * mult


@dataclass
class Event:
    record_id: str
    url: str
    title: str
    outlet: str
    published: str
    source: str
    event_types: list[str] = field(default_factory=list)
    species: list[str] = field(default_factory=list)
    terms: list[str] = field(default_factory=list)
    place: dict | None = None
    places: list[str] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    route: list[str] = field(default_factory=list)
    agencies: list[str] = field(default_factory=list)
    modes: list[str] = field(default_factory=list)
    quantities: list[dict] = field(default_factory=list)
    value_inr: float | None = None
    people_arrested: int | None = None
    evidence: list[str] = field(default_factory=list)
    relevance: float | None = None
    trade_signal: float | None = None

    def to_dict(self):
        return asdict(self)


def is_enforcement_candidate(text: str) -> bool:
    return bool(lexicon.species_groups(text)) and sum(lexicon.count_cues(text, "enforcement_cues").values()) > 0


def extract(rec: Record) -> Event:
    text = f"{rec.title}. {rec.text}"
    ev = Event(rec.id, rec.url, rec.title, rec.outlet, rec.published, rec.source)
    ev.species = lexicon.species_groups(text)
    ev.terms = lexicon.matched_terms(text)
    ev.event_types = [k for k, v in lexicon.count_cues(text, "enforcement_cues").items() if v]
    ev.modes = [k for k, v in lexicon.count_cues(text, "modes").items() if v]

    ags = []
    for region, names in lexicon.load()["agencies"].items():
        for n in names:
            if re.search(r"(?<![A-Za-z])" + re.escape(n) + r"(?![A-Za-z])", text, re.I if len(n) > 5 else 0):
                ags.append(AGENCY_CANON.get(n.lower(), n if n.isupper() else n.title()))
    ev.agencies = sorted(set(ags))

    hint = rec.country_hint if len(rec.country_hint) == 2 else ""
    places = find_places(text, hint)
    pp = primary_place(places, hint)
    if pp:
        ev.place = asdict(pp)
    ev.places = [p.name for _, p in places]
    ev.countries = sorted({p.country for _, p in places})

    for m in ROUTE.finditer(text):
        a, b = find_places(m.group(1)), find_places(m.group(2))
        if a and b:
            ev.route = [a[0][1].name, b[0][1].name]; ev.evidence.append(m.group(0)); break
    if not ev.route:
        m = DEST.search(text)
        if m and (b := find_places(m.group(1))) and pp and b[0][1].name != pp.name:
            ev.route = [pp.name, b[0][1].name]; ev.evidence.append(m.group(0))

    hits: list[tuple[int, int, re.Match]] = []
    for rx in (QTY, QTY_GAP):
        for m in rx.finditer(text):
            if not any(a < m.end() and m.start() < b for a, b, _ in hits):
                hits.append((m.start(), m.end(), m))
    for _, _, m in sorted(hits, key=lambda h: h[0]):  # text order: headline quantities lead
        ev.quantities.append({"value": _num(m.group(1)), "unit": m.group(2).lower()})
        ev.evidence.append(m.group(0))
    m = MONEY.search(text)
    if m:
        v = _money_inr(m.group(1), m.group(2))
        if v and ("$" in m.group(0) or "usd" in m.group(0).lower()):
            v = None  # keep currencies separate; only INR totals are summed
        ev.value_inr = v
        ev.evidence.append(m.group(0))
    m = PEOPLE.search(text) or PEOPLE_SHORT.search(text)
    if m:
        ev.people_arrested = int(_num(m.group(1))); ev.evidence.append(m.group(0))
    return ev
