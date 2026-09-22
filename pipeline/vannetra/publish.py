"""Build step: raw records → scored → extracted → cases → public JSON for the website.

Private intermediate output (headlines, full extraction) goes to data/interim.
Public output goes to web/data and passes privacy.assert_public_safe first.
"""
from __future__ import annotations

import json
import time
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from . import lexicon
from .collect.base import read_all_raw
from .config import INTERIM, LABELS, MODELS, RESOURCES, WEB_DATA, ensure_dirs
from .extract.cases import cluster, summarise
from .extract.events import extract, is_enforcement_candidate
from .graph import build as graph
from .privacy import assert_public_safe, scrub


def _dump(name: str, obj) -> Path:
    p = WEB_DATA / name
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")
    return p


def score_records(recs):
    """Attach the listing model's P(trade signal) when a trained model exists."""
    try:
        from .classify.train import load_model, predict
        bundle = load_model()
    except Exception:
        return {}
    texts = [f"{r.title} \n {r.text}" for r in recs]
    return dict(zip([r.id for r in recs], predict(texts, bundle).round(4))) if texts else {}


def stats(cases: list[dict]) -> dict:
    by = lambda f: Counter(x for c in cases for x in f(c))
    month = Counter((c["date"] or "")[:7] for c in cases if c.get("date"))
    routes = Counter(tuple(c["route"]) for c in cases if len(c.get("route") or []) == 2)
    state = Counter((c["place"] or {}).get("admin1") or (c["place"] or {}).get("name") for c in cases if c.get("place"))
    sp_state = defaultdict(Counter)
    for c in cases:
        if c.get("place"):
            for s in c["species"]:
                sp_state[s][(c["place"].get("admin1") or c["place"]["name"])] += 1
    return {
        "kpi": {
            "cases": len(cases),
            "sources": sum(c["n_sources"] for c in cases),
            "species_groups": len({s for c in cases for s in c["species"]}),
            "countries": len({c["place"]["country"] for c in cases if c.get("place")}),
            "people_arrested": sum(c["people_arrested"] or 0 for c in cases),
            "value_inr": sum(c["value_inr"] or 0 for c in cases),
            "appendix_I_cases": sum(1 for c in cases if any(
                str(lexicon.load()["groups"].get(s, {}).get("cites", "")).startswith("I") and
                not str(lexicon.load()["groups"].get(s, {}).get("cites", "")).startswith("II") for s in c["species"])),
        },
        "by_species": dict(by(lambda c: c["species"]).most_common()),
        "by_kind": dict(Counter(c["kind"] for c in cases).most_common()),
        "by_agency": dict(by(lambda c: c["agencies"]).most_common(25)),
        "by_mode": dict(by(lambda c: c["modes"]).most_common()),
        "by_region": dict(state.most_common(40)),
        "by_month": dict(sorted(month.items())),
        "routes": [{"from": a, "to": b, "n": n} for (a, b), n in routes.most_common(50)],
        "species_by_region": {s: dict(v.most_common(10)) for s, v in sp_state.items()},
    }


def trade_signals() -> dict:
    """Aggregate view of the WCS-OWT online-trade set (supply side). No URLs, no channels."""
    try:
        from .classify.dataset import load_labelled
        df, _ = load_labelled()
    except FileNotFoundError:
        return {}
    out = {"by_group": {}, "cues": {}}
    for gid, sub in df.groupby("group"):
        out["by_group"][gid] = {"label": lexicon.group_label(gid) if gid != "unknown" else "Unmatched",
                                "R": int(sub["y"].sum()), "IR": int((1 - sub["y"]).sum())}
    cue_counts = Counter()
    for t in df.loc[df["y"] == 1, "text"]:
        for k, v in lexicon.count_cues(t, "sale_cues").items():
            cue_counts[k] += v
    out["cues"] = dict(cue_counts)
    out["phone_in_R"] = round(float(df.loc[df["y"] == 1, "text"].str.contains(r"[6-9]\d{9}").mean()), 3)
    out["phone_in_IR"] = round(float(df.loc[df["y"] == 0, "text"].str.contains(r"[6-9]\d{9}").mean()), 3)
    out["n"] = int(len(df))
    return out


def live_listings(listings, scores) -> dict:
    """Aggregate freshly collected online listings (YouTube etc.). Public output is
    counts only: per species group and month, split by the classifier's decision.
    Titles, channels and URLs stay private; unverified codeword hits go to a
    private review file."""
    try:
        from .classify.train import load_model
        thr = float(load_model()["threshold"])
    except Exception:
        thr = None
    by_group: dict[str, dict[str, int]] = defaultdict(lambda: {"flagged": 0, "not_flagged": 0, "unscored": 0})
    by_month: Counter = Counter()
    review = []
    for r in listings:
        text = f"{r.title} {r.text}"
        groups = lexicon.species_groups(text) or ["unknown"]
        p = scores.get(r.id)
        key = "unscored" if p is None or thr is None else ("flagged" if p >= thr else "not_flagged")
        for g in groups:
            by_group[g][key] += 1
        when = r.published or (r.extra or {}).get("seen", "")
        if key == "flagged" and when:
            by_month[when[:7]] += 1
        hits = lexicon.codeword_hits(text)
        if hits:
            review.append({"id": r.id, "url": r.url, "title": r.title, "p_relevant": p,
                           "codewords": ";".join(h["term"] for h in hits)})
    if review:
        import csv
        with open(LABELS / "codeword_review.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(review[0])); w.writeheader(); w.writerows(review)
    return {"n": len(listings), "threshold": thr, "by_group": dict(by_group), "flagged_by_month": dict(sorted(by_month.items())),
            "codeword_flags": len(review)}


def enrich(cands, limit: int = 200) -> None:
    """Add article ledes to headline-only candidates (private; cached in data/interim)."""
    from .collect.article import lede
    path = INTERIM / "ledes.json"
    cache = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    todo = [r for r in cands if not r.text and r.id not in cache][:limit]
    for i, r in enumerate(todo, 1):
        cache[r.id] = lede(r.url)
        if i % 10 == 0:
            print(f"  enriched {i}/{len(todo)}")
    path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    for r in cands:
        if not r.text and cache.get(r.id):
            r.text = cache[r.id]


def build(min_relevance: float | None = None, fetch_text: bool = True) -> dict:
    ensure_dirs()
    recs = read_all_raw()
    news = [r for r in recs if r.kind in ("news", "official", "court")]
    listings = [r for r in recs if r.kind in ("listing", "video")]
    scores = score_records(news + listings)

    cand = [r for r in news if is_enforcement_candidate(f"{r.title} {r.text}")]
    if fetch_text:
        enrich(cand)
    events = []
    for r in cand:
        e = extract(r)
        e.trade_signal = float(scores[r.id]) if r.id in scores else None
        events.append(e)
    with open(INTERIM / "events.jsonl", "w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e.to_dict(), ensure_ascii=False) + "\n")

    cases = [summarise(g) for g in cluster(events)]
    cases.sort(key=lambda c: c.get("date") or "", reverse=True)
    for c in cases:
        c["summary"] = scrub(c["summary"])

    G = graph.build(cases)
    assert_public_safe(cases, "cases")

    geo = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [c["place"]["lon"], c["place"]["lat"]]},
         "properties": {"id": c["id"], "kind": c["kind"], "date": c["date"], "summary": c["summary"],
                        "species": ",".join(c["species"]), "n_sources": c["n_sources"],
                        "country": c["place"]["country"], "level": c["place"]["type"],
                        "basis": c.get("place_basis", "text")}}
        for c in cases if c.get("place")]}

    with open(RESOURCES / "sources.yaml", encoding="utf-8") as f:
        registry = yaml.safe_load(f)["sources"]
    lex = lexicon.load()["groups"]
    species_meta = {gid: {"label": g["label"], "taxa": g.get("taxa", []), "cites": g.get("cites"),
                          "products": g.get("products", []), "uses": g.get("uses", []),
                          "terms": {k: v for k, v in g["terms"].items()}} for gid, g in lex.items()}
    report = {}
    if (MODELS / "relevance_report.json").exists():
        report = json.loads((MODELS / "relevance_report.json").read_text(encoding="utf-8"))
        report.pop("review_queue", None)

    s = stats(cases)
    meta = {"built": time.strftime("%Y-%m-%d %H:%M"), "records_seen": len(recs), "news_records": len(news),
            "listing_records": len(listings), "by_source": dict(Counter(r.source for r in recs)),
            "candidates": len(cand), "cases": len(cases), "version": "0.1.0",
            "window": [min((c["date"] for c in cases if c.get("date")), default=""),
                       max((c["date"] for c in cases if c.get("date")), default="")]}

    _dump("cases.json", cases); _dump("cases.geojson", geo); _dump("stats.json", s)
    _dump("species.json", species_meta); _dump("sources.json", registry); _dump("meta.json", meta)
    obs = yaml.safe_load((RESOURCES / "observatories.yaml").read_text(encoding="utf-8"))
    _dump("observatories.json", obs)
    _dump("codewords.json", [{k: v for k, v in c.items()} for c in lexicon.codewords()])
    # CI has no private data or model: keep the last published aggregates instead of blanking them.
    ts = trade_signals()
    old_ts = WEB_DATA / "trade_signals.json"
    if not ts and old_ts.exists():  # CI: no private data, keep the published OWT aggregates
        ts = json.loads(old_ts.read_text(encoding="utf-8"))
    ts["live"] = live_listings(listings, scores)
    _dump("trade_signals.json", ts)
    if report or not (WEB_DATA / "model_report.json").exists():
        _dump("model_report.json", report)
    graph.export(G, WEB_DATA)
    print(f"built: {len(recs)} records -> {len(cand)} enforcement candidates -> {len(cases)} cases; "
          f"graph {G.number_of_nodes()} nodes / {G.number_of_edges()} links -> {WEB_DATA}")
    return meta
