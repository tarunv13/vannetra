"""CITES Trade Database loader: the legal-trade (demand/supply) baseline.

Download the full database from https://trade.cites.org/ (``Download`` → full
database, a zip of CSVs, updated yearly), unzip it anywhere, and run

    wildtrace cites path/to/Trade_database_download_vYYYY.1

The loader streams each CSV, keeps shipments where the exporter or importer is
in scope, maps taxa onto the lexicon's species groups, and aggregates flows:
exporter → importer × group × year, with quantities and the share whose
Source code is ``I`` (confiscated/seized specimens). Individual permits are never
published.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from .. import lexicon
from ..config import WEB_DATA

SCOPE = {"IN", "NP", "BD", "LK", "BT", "MM", "TH", "VN", "LA", "KH", "MY", "SG", "ID", "PH", "CN", "HK"}
USE = ["Year", "Taxon", "Genus", "Family", "Order", "Class", "Term", "Quantity", "Unit",
       "Importer", "Exporter", "Origin", "Purpose", "Source"]


def _taxon_to_group() -> dict[str, str]:
    m = {}
    for gid, g in lexicon.load()["groups"].items():
        for t in g.get("taxa", []):
            key = t.replace(" spp.", "").strip().lower()
            m[key] = gid
    return m


def _group(row, tmap) -> str | None:
    for col in ("Taxon", "Genus", "Family", "Order"):
        v = str(row.get(col) or "").lower()
        if not v:
            continue
        if v in tmap:
            return tmap[v]
        g = v.split(" ")[0]
        if g in tmap:
            return tmap[g]
    return None


def load(folder: Path, min_year: int = 2000) -> pd.DataFrame:
    tmap = _taxon_to_group()
    parts = []
    for csv in sorted(Path(folder).glob("*.csv")):
        for chunk in pd.read_csv(csv, usecols=lambda c: c in USE, dtype=str, chunksize=200_000, low_memory=False):
            chunk = chunk[(chunk["Exporter"].isin(SCOPE)) | (chunk["Importer"].isin(SCOPE))]
            chunk = chunk[pd.to_numeric(chunk["Year"], errors="coerce") >= min_year]
            if chunk.empty:
                continue
            chunk = chunk.assign(group=chunk.apply(lambda r: _group(r, tmap), axis=1)).dropna(subset=["group"])
            chunk["Quantity"] = pd.to_numeric(chunk["Quantity"], errors="coerce").fillna(0)
            chunk["seized"] = (chunk["Source"] == "I").astype(int)
            parts.append(chunk)
        print(f"  {csv.name}: {sum(len(p) for p in parts)} in-scope shipments so far")
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=USE + ["group", "seized"])


def publish_flows(df: pd.DataFrame, out: Path = WEB_DATA) -> Path:
    agg = (df.groupby(["Exporter", "Importer", "group", "Year"])
             .agg(shipments=("Quantity", "size"), quantity=("Quantity", "sum"), seized=("seized", "sum"))
             .reset_index())
    rows = agg.rename(columns=str.lower).to_dict(orient="records")
    path = out / "cites_flows.json"
    path.write_text(json.dumps({"source": "CITES Trade Database (UNEP-WCMC)", "rows": rows}), encoding="utf-8")
    return path
