"""Literature miner: what the research says that the news never reports.

News coverage of wildlife crime is skewed towards large animals. Plants are traded in the
open — orchids, succulents, cacti, cycads, medicinal roots — and are rarely a story, so a
media-fed pipeline underestimates them badly. The peer-reviewed literature does cover them, and
it also records the two things this project most needs: the **names traders actually use** (trade
names, vernacular names, code words) and the **datasets** other researchers have published.

This module mines three things from open scholarly sources, and nothing is merged automatically:

  taxa      binomials found in titles and abstracts, checked against the GBIF backbone so each
            one arrives with its kingdom, family and accepted name. That is what separates a
            plant from an animal reliably, and what lets flora coverage be audited.
  terms     candidate trade names and code words, taken only from sentences where a paper
            explicitly says a name is used in trade ("sold as", "known locally as", "code word").
  datasets  repository links and DOIs a paper published its data at, for the observatory list.

Sources, both free and without a key:
  * Europe PMC   — abstracts, open licence metadata, generous rate limits
  * OpenAlex     — broader coverage, polite pool via a mailto in the query

Output lands in `data/interim/` as CSV for a person to read and accept, never straight into the
lexicon. A miner that edits its own dictionary is a miner that teaches itself its own mistakes.
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from datetime import date

from ..config import INTERIM, RAW
from ..schema import Record
from .base import get

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
OPENALEX = "https://api.openalex.org/works"
GBIF_MATCH = "https://api.gbif.org/v1/species/match"
MAILTO = "wildtrace@users.noreply.github.com"   # OpenAlex polite pool

# Topics are grouped so a run can be aimed at the gap that matters. Flora first: it is the part
# the news misses. Each string is one query; quotes keep phrases together.
TOPICS: dict[str, list[str]] = {
    "flora": [
        '"illegal trade" AND (orchid OR orchids) AND (wild OR poaching OR CITES)',
        '"illegal wildlife trade" AND (succulent OR succulents OR cactus OR cacti)',
        '(cycad OR cycads OR Encephalartos) AND (poaching OR "illegal trade")',
        '(Nepenthes OR "pitcher plant" OR "venus flytrap") AND ("illegal trade" OR poaching)',
        '("medicinal plants" OR "medicinal plant") AND ("illegal trade" OR smuggling OR poaching)',
        '(rosewood OR "Dalbergia" OR "Pterocarpus") AND (seizure OR seizures OR "illegal logging")',
        '(agarwood OR Aquilaria OR sandalwood OR Santalum) AND ("illegal trade" OR smuggling)',
        '("wild harvest" OR "wild-collected") AND (bulbs OR "tree fern" OR "wild plants") AND trade',
        '"plant blindness" OR "plant trade" AND CITES AND enforcement',
    ],
    "codewords": [
        '"code words" AND ("wildlife trade" OR "illegal wildlife")',
        '("online wildlife trade" OR "e-commerce") AND (keywords OR nomenclature OR terminology)',
        '"wildlife trafficking" AND (euphemism OR slang OR "coded language" OR "trade names")',
        '("social media") AND ("wildlife trade") AND (detection OR monitoring OR "text classification")',
    ],
    "fauna": [
        '"seizure data" AND ("illegal wildlife trade") AND (pangolin OR ivory OR "rhino horn")',
        '("illegal wildlife trade") AND (songbird OR parrot OR reptile) AND (market OR online)',
        '("wildlife trade") AND (Africa OR "Latin America" OR "Southeast Asia") AND seizures',
    ],
    "datasets": [
        '("wildlife trade") AND (dataset OR database) AND (open OR "freely available")',
        '("seizure records") AND ("data availability") AND wildlife',
    ],
}

BINOMIAL = re.compile(r"\b([A-Z][a-z]{2,})\s+([a-z]{3,})(?:\s+(?:subsp|var)\.\s*[a-z]+)?\b")
# A paper only tells us a name is a trade name when it says so. These are the ways it says so.
TRADE_CUE = re.compile(
    r"(?:(?:sold|traded|marketed|advertised|offered|listed)\s+(?:on|in|as|under)\s+(?:the\s+)?(?:name\s+)?"
    r"|known\s+(?:locally\s+)?as|locally\s+(?:called|known\s+as)|referred\s+to\s+as|trade\s+names?\s+"
    r"(?:of|include[sd]?|are|is)?|code\s*words?\s+(?:such\s+as|include[sd]?|are|is|for)?|vernacular\s+names?\s*"
    r"(?:include[sd]?|are|is)?|commonly\s+called)\s*[:,]?\s*", re.I)
QUOTED = re.compile(r"[\"“‘']([^\"“”‘’']{3,40})[\"”’']")
REPOS = re.compile(r"https?://(?:[\w.-]*\.)?(zenodo\.org|datadryad\.org|figshare\.com|osf\.io|dataverse\.[\w.]+|"
                   r"data\.mendeley\.com|gbif\.org|kaggle\.com|github\.com)/\S*", re.I)
DOI = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.I)
# Genus-like words that are really sentence starts, journal names or places.
STOP_GENUS = {"The", "This", "These", "Our", "We", "In", "Illegal", "Wildlife", "Trade", "Online", "Species",
              "International", "Convention", "United", "South", "North", "East", "West", "New", "Data", "Journal",
              "Conservation", "Biological", "Global", "National", "Using", "Here", "However", "Results", "Between",
              "Among", "Both", "While", "During", "After", "Before", "Based", "From", "Most", "Many", "Some", "All"}


def _epmc(query: str, pages: int) -> list[Record]:
    out, cursor = [], "*"
    for _ in range(pages):
        r = get(EPMC, params={"query": query, "format": "json", "resultType": "core",
                              "pageSize": 100, "cursorMark": cursor}, cache_hours=24 * 14)
        if r is None or not r.ok:
            break
        try:
            d = r.json()
        except ValueError:
            break
        for it in d.get("resultList", {}).get("result", []):
            doi = it.get("doi", "")
            url = f"https://doi.org/{doi}" if doi else (it.get("fullTextUrlList", {}).get("fullTextUrl", [{}])[0].get("url")
                                                        or f"https://europepmc.org/article/{it.get('source','MED')}/{it.get('id','')}")
            out.append(Record(url=url, title=it.get("title", ""), text=it.get("abstractText", "") or "",
                              source="literature", outlet=it.get("journalTitle", "") or "Europe PMC",
                              published=str(it.get("firstPublicationDate", ""))[:10], kind="paper", query=query,
                              extra={"doi": doi, "cited_by": it.get("citedByCount", 0),
                                     "open_access": it.get("isOpenAccess", "N")}))
        nxt = d.get("nextCursorMark")
        if not nxt or nxt == cursor:
            break
        cursor = nxt
    return out


def _openalex(query: str, pages: int) -> list[Record]:
    out = []
    for page in range(1, pages + 1):
        r = get(OPENALEX, params={"search": query, "per-page": 50, "page": page, "mailto": MAILTO},
                cache_hours=24 * 14)
        if r is None or not r.ok:
            break
        try:
            works = r.json().get("results", [])
        except ValueError:
            break
        for w in works:
            # OpenAlex ships abstracts as an inverted index; rebuild enough of it to mine.
            inv = w.get("abstract_inverted_index") or {}
            words = sorted(((pos, term) for term, ps in inv.items() for pos in ps), key=lambda x: x[0])
            abstract = " ".join(t for _, t in words)
            out.append(Record(url=w.get("doi") or w.get("id", ""), title=w.get("title") or "", text=abstract,
                              source="literature", outlet=((w.get("primary_location") or {}).get("source") or {}).get("display_name") or "OpenAlex",
                              published=(w.get("publication_date") or "")[:10], kind="paper", query=query,
                              extra={"doi": (w.get("doi") or "").replace("https://doi.org/", ""),
                                     "cited_by": w.get("cited_by_count", 0)}))
        if len(works) < 50:
            break
    return out


def _gbif(name: str) -> dict:
    """Ask the GBIF backbone what a binomial is. This is what tells a plant from an animal."""
    # A small delay: the backbone drops connections when hit in a tight loop.
    r = get(GBIF_MATCH, params={"name": name, "strict": "false"}, cache_hours=24 * 365,
            check_robots=False, delay=0.4, retries=2)
    if r is None or not r.ok:
        return {}
    try:
        d = r.json()
    except ValueError:
        return {}
    return d if d.get("matchType") not in (None, "NONE") and d.get("confidence", 0) >= 90 else {}


def mine_taxa(recs: list[Record]) -> list[dict]:
    """Binomials in titles and abstracts, resolved against GBIF."""
    seen: dict[str, set[str]] = defaultdict(set)
    for rec in recs:
        for g, sp in BINOMIAL.findall(f"{rec.title}. {rec.text}"):
            if g in STOP_GENUS or len(g) < 4:
                continue
            seen[f"{g} {sp}"].add(rec.extra.get("doi") or rec.url)
    rows = []
    for name, dois in sorted(seen.items(), key=lambda kv: -len(kv[1])):
        if len(dois) < 2:      # one paper is a mention; two is a pattern worth checking
            continue
        m = _gbif(name)
        if m and m.get("rank") not in ("SPECIES", "SUBSPECIES"):
            continue      # a genus or family match says nothing about a traded species
        # An unresolved name is still worth a reviewer's eye, so it is kept and marked.
        rows.append({"name": m.get("canonicalName", name) if m else name,
                     "kingdom": m.get("kingdom", "") if m else "unresolved",
                     "family": m.get("family", "") if m else "", "status": m.get("status", "") if m else "",
                     "gbif_key": m.get("usageKey", "") if m else "", "papers": len(dois),
                     "example": sorted(dois)[0]})
    return rows


# A candidate has to survive three filters, because "referred to as" introduces far more ordinary
# English than it does trade names. The sentence must be about trade, the name must be quoted, and
# the name must not be built only from everyday words.
CONTEXT = re.compile(r"trade|traded|trading|sold|sell|seller|market|smuggl|traffick|seiz|poach|specimen|"
                     r"wildlife|plant|orchid|timber|ivory|horn|scale|skin|pet|advert|listing", re.I)
GENERIC = {"species", "these", "this", "that", "used", "using", "hotspots", "hotspot", "e-commerce", "ecommerce",
           "internet", "online", "dark web", "wildlife", "trade", "wildlife trade", "illegal wildlife trade",
           "data", "database", "dataset", "study", "research", "the internet", "social media", "code words",
           "code word", "keywords", "keyword", "products", "product", "items", "item", "goods"}
STOPWORDS = {"the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "these", "this", "that", "their",
             "its", "such", "as", "is", "are", "was", "were", "be", "been", "related", "used", "using", "other"}


def mine_terms(recs: list[Record]) -> list[dict]:
    """Candidate trade names and code words, each with the sentence that justifies it.

    Only quoted names count. An unquoted fallback was tried first and produced mostly ordinary
    prose ("related to these species", "used"), which would have poisoned the lexicon.
    """
    rows, seen = [], set()
    for rec in recs:
        text = f"{rec.title}. {rec.text}"
        for m in TRADE_CUE.finditer(text):
            window = text[m.end():m.end() + 160]
            sentence = text[max(0, m.start() - 120):m.end() + 160]
            if not CONTEXT.search(sentence):
                continue
            for n in QUOTED.findall(window):
                term = n.strip().strip(",.;:").lower()
                words = re.findall(r"[^\W\d_]+", term)
                if (not term or term in seen or term in GENERIC or not words or len(words) > 4
                        or all(w in STOPWORDS for w in words) or len(term) < 3):
                    continue
                seen.add(term)
                rows.append({"term": term, "cue": " ".join(sentence.split())[:240],
                             "doi": rec.extra.get("doi", ""), "title": rec.title[:120]})
    return rows


def mine_datasets(recs: list[Record]) -> list[dict]:
    """Repositories and DOIs papers published their data at."""
    rows, seen = [], set()
    for rec in recs:
        for m in REPOS.finditer(f"{rec.title} {rec.text}"):
            url = m.group(0).rstrip(").,;")
            if url in seen:
                continue
            seen.add(url)
            rows.append({"url": url, "host": m.group(1).lower(), "from_doi": rec.extra.get("doi", ""),
                         "title": rec.title[:140]})
    return rows


def _write_csv(rows: list[dict], name: str) -> str:
    path = INTERIM / name
    if not rows:
        return f"  {name}: nothing found"
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    return f"  {name}: {len(rows)} rows -> {path}"


def collect_literature(topics: str = "all", pages: int = 2) -> list[Record]:
    """Search the scholarly sources and keep the papers themselves (private, like any raw pull)."""
    want = list(TOPICS) if topics == "all" else [t for t in topics.split(",") if t in TOPICS]
    recs: list[Record] = []
    for topic in want:
        for q in TOPICS[topic]:
            got = _epmc(q, pages) + _openalex(q, pages)
            print(f"  {topic}: {len(got):4d} papers for {q[:60]}…")
            recs += got
    by_url: dict[str, Record] = {}
    for r in recs:
        if r.url and r.title:
            by_url.setdefault(r.url.lower(), r)
    return list(by_url.values())


def mine(topics: str = "all", pages: int = 2) -> dict:
    """The whole run: search, then mine taxa, terms and datasets for review."""
    recs = collect_literature(topics, pages)
    print(f"papers: {len(recs)} unique")
    raw = RAW / f"{date.today():%Y%m%d}_literature.jsonl"
    with open(raw, "w", encoding="utf-8") as f:
        for r in recs:
            f.write(json.dumps(r.to_dict(), ensure_ascii=False) + "\n")
    taxa, terms, datasets = mine_taxa(recs), mine_terms(recs), mine_datasets(recs)
    print(_write_csv(taxa, "mined_taxa.csv"))
    print(_write_csv(terms, "mined_terms.csv"))
    print(_write_csv(datasets, "mined_datasets.csv"))
    plants = sum(1 for t in taxa if t["kingdom"] == "Plantae")
    print(f"  taxa: {plants} plant, {len(taxa) - plants} animal and other")
    print("Nothing was merged. Review the CSVs, then add what survives to resources/lexicon.yaml.")
    return {"papers": len(recs), "taxa": len(taxa), "plants": plants, "terms": len(terms), "datasets": len(datasets)}
