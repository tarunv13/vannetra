"""Load and harmonise labelled training data.

Two schemas exist in the WCS-OWT folder:

* ``Classification_Model_Training_Data.csv``: Link, Channel Name, Title, Description, Species, Label
* ``Train_2ndFeb.csv``: URL, ChannelName, Title, Desc, TopicDetails, Class

Both label YouTube videos as R (relevant: trade/advertisement of wildlife products)
or IR (irrelevant). Rows whose label is actually a status note ("Video unavailable")
are dropped. Duplicates are merged by video id; conflicting labels are kept out of
training and written to the review queue.

Human corrections in ``data/labels/corrections.csv`` (columns: id,label) override
the original labels, which is how the active-learning loop feeds back.
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from .. import lexicon
from ..config import LABELS, WCS_OWT_DIR

LABEL_MAP = {"R": 1, "IR": 0}
_YT_ID = re.compile(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})")


def _video_id(url: str) -> str:
    m = _YT_ID.search(str(url))
    return m.group(1) if m else str(url).strip().lower()


def _read(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8", dtype=str, keep_default_na=False)
    df.columns = [c.strip().lower() for c in df.columns]
    ren = {"link": "url", "channel name": "channel", "channelname": "channel", "desc": "description", "class": "label"}
    df = df.rename(columns=ren)
    for col in ("url", "channel", "title", "description", "species", "label"):
        if col not in df:
            df[col] = ""
    df = df[["url", "channel", "title", "description", "species", "label"]].copy()
    df["label"] = df["label"].str.strip().str.upper()
    df["file"] = path.name
    return df


def find_files(folder: Path | None = None) -> list[Path]:
    folder = Path(folder or WCS_OWT_DIR)
    files = sorted(p for p in folder.rglob("*.csv") if "checkpoint" not in str(p).lower())
    if not files:
        raise FileNotFoundError(
            f"No CSVs under {folder}. Set WILDTRACE_WCS_OWT_DIR to your WCS-OWT folder."
        )
    return files


def load_labelled(folder: Path | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (training frame, conflicts frame)."""
    raw = pd.concat([_read(p) for p in find_files(folder)], ignore_index=True)
    raw = raw[raw["label"].isin(LABEL_MAP)].copy()
    raw["id"] = raw["url"].map(_video_id)

    # Resolve duplicates: same id with more than one distinct label is a conflict.
    n_labels = raw.groupby("id")["label"].nunique()
    conflict_ids = set(n_labels[n_labels > 1].index)
    conflicts = raw[raw["id"].isin(conflict_ids)].sort_values("id")

    df = raw[~raw["id"].isin(conflict_ids)]
    # Prefer the row that carries a species value when merging duplicates.
    df = df.sort_values("species", ascending=False).drop_duplicates("id", keep="first")

    corr_path = LABELS / "corrections.csv"
    if corr_path.exists():
        corr = pd.read_csv(corr_path, dtype=str).dropna()
        corr = corr[corr["label"].str.upper().isin(LABEL_MAP)]
        fix = dict(zip(corr["id"], corr["label"].str.upper()))
        df["label"] = df.apply(lambda r: fix.get(r["id"], r["label"]), axis=1)

    df["y"] = df["label"].map(LABEL_MAP).astype(int)
    df["text"] = (df["title"].fillna("") + " \n " + df["description"].fillna("")).str.strip()
    # Species group from the lexicon where the sheet does not say.
    df["group"] = df.apply(
        lambda r: (lexicon.species_groups(r["species"] + " " + r["text"]) or ["unknown"])[0], axis=1
    )
    # Channel is used ONLY as a grouping key so CV never sees the same seller in
    # train and test. It is never a feature and never published.
    df["channel"] = df["channel"].str.strip().str.lower().replace("", pd.NA)
    df["cv_group"] = df["channel"].fillna(df["id"])
    return df.reset_index(drop=True), conflicts
