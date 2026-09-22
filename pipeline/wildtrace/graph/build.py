"""Build the entity–link graph used by the web workbench (the i2 Analyst's Notebook
style chart).

Entity types follow the usual i2 semantic types, restricted to what can be
published safely:

  Case, Species, Location, Agency, Outlet, Mode, Commodity

Person, Phone, Account and Vehicle entities are supported by the workbench
but are only ever created locally by the analyst (import CSV / manual entry).
They are never produced by this public build.

Links carry a type, a weight (number of supporting cases) and dates, so the
workbench can filter links by time and strength.

Outputs: web/data/graph.json (Cytoscape elements), plus GraphML and a
nodes/links CSV pair that i2 Analyst's Notebook, Gephi or Maltego can import.
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

import networkx as nx

from .. import lexicon


def _nid(kind: str, key: str) -> str:
    return f"{kind}:{key}".lower().replace(" ", "_")


def build(cases: list[dict]) -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()
    edge_acc: dict[tuple, dict] = defaultdict(lambda: {"weight": 0, "dates": [], "cases": []})

    def node(etype, key, label, **attrs):
        n = _nid(etype, key)
        if n not in G:
            G.add_node(n, type=etype, label=label, **attrs)
        return n

    def link(a, b, rel, case):
        e = edge_acc[(a, b, rel)]
        e["weight"] += 1; e["cases"].append(case["id"])
        if case.get("date"):
            e["dates"].append(case["date"])

    for c in cases:
        cn = node("Case", c["id"], c["summary"], date=c.get("date"), kind=c["kind"],
                  confidence=c.get("confidence"), n_sources=c.get("n_sources"))
        for s in c["species"]:
            g = lexicon.load()["groups"].get(s, {})
            sn = node("Species", s, lexicon.group_label(s), cites=g.get("cites"), taxa=", ".join(g.get("taxa", [])))
            link(cn, sn, "involves", c)
        if c.get("place"):
            p = c["place"]
            ln = node("Location", p["name"], p["name"], lat=p["lat"], lon=p["lon"], country=p["country"],
                      admin1=p.get("admin1", ""), level=p["type"])
            link(cn, ln, "occurred_at", c)
            if p.get("admin1") and p["admin1"] != p["name"]:
                an = node("Location", p["admin1"], p["admin1"], country=p["country"], level="state")
                link(ln, an, "within", c)
        if len(c.get("route") or []) == 2:
            a, b = c["route"]
            link(node("Location", a, a), node("Location", b, b), "trafficked_to", c)
        for ag in c.get("agencies", []):
            link(node("Agency", ag, ag), cn, "acted_in", c)
        for m in c.get("modes", []):
            link(cn, node("Mode", m, m.capitalize()), "via", c)
        for s in c.get("sources", []):
            if s.get("outlet"):
                link(node("Outlet", s["outlet"], s["outlet"]), cn, "reported", c)
        if c.get("quantity"):
            u = c["quantity"]["unit"]
            for sp in c["species"]:
                link(cn, node("Commodity", f"{sp}-{u}", f"{lexicon.group_label(sp)} – {u}"), "seized", c)

    for (a, b, rel), e in edge_acc.items():
        ds = sorted(e["dates"])
        G.add_edge(a, b, key=rel, type=rel, weight=e["weight"], first=ds[0] if ds else "",
                   last=ds[-1] if ds else "", cases=";".join(e["cases"][:50]))
    return G


def analytics(G: nx.MultiDiGraph) -> dict[str, dict]:
    """Degree, betweenness and community per node: the 'who is central' view."""
    U = nx.Graph()
    for a, b, d in G.edges(data=True):
        w = U[a][b]["weight"] + d["weight"] if U.has_edge(a, b) else d["weight"]
        U.add_edge(a, b, weight=w)
    U.add_nodes_from(G.nodes)
    bc = nx.betweenness_centrality(U, k=min(300, len(U)) if len(U) > 300 else None, seed=1) if len(U) else {}
    comms = nx.community.louvain_communities(U, seed=1) if U.number_of_edges() else []
    cmap = {n: i for i, c in enumerate(comms) for n in c}
    return {n: {"degree": U.degree(n), "betweenness": round(bc.get(n, 0), 5), "community": cmap.get(n, -1)}
            for n in U.nodes}


def export(G: nx.MultiDiGraph, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    stats = analytics(G)
    elements = []
    for n, d in G.nodes(data=True):
        elements.append({"group": "nodes", "data": {"id": n, **{k: v for k, v in d.items() if v not in (None, "")},
                                                     **stats.get(n, {})}})
    for i, (a, b, d) in enumerate(G.edges(data=True)):
        elements.append({"group": "edges", "data": {"id": f"e{i}", "source": a, "target": b,
                                                     **{k: v for k, v in d.items() if k != "cases"}}})
    (out_dir / "graph.json").write_text(json.dumps({"elements": elements}, ensure_ascii=False), encoding="utf-8")

    # Interchange formats for desktop tools (i2 ANB imports delimited text; Gephi reads GraphML).
    H = nx.DiGraph()
    for n, d in G.nodes(data=True):
        H.add_node(n, **{k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in d.items() if v is not None})
    for a, b, d in G.edges(data=True):
        H.add_edge(a, b, **{k: v for k, v in d.items() if v is not None})
    nx.write_graphml(H, out_dir / "graph.graphml")
    with open(out_dir / "entities.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "type", "label", "lat", "lon", "degree", "betweenness"])
        for n, d in G.nodes(data=True):
            s = stats.get(n, {})
            w.writerow([n, d["type"], d["label"], d.get("lat", ""), d.get("lon", ""), s.get("degree"), s.get("betweenness")])
    with open(out_dir / "links.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["source", "target", "type", "weight", "first", "last"])
        for a, b, d in G.edges(data=True):
            w.writerow([a, b, d["type"], d["weight"], d["first"], d["last"]])
