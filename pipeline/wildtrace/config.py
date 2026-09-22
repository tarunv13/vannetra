"""Paths and runtime settings. Everything is overridable with environment variables
so the project can be moved between machines without editing code."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("WILDTRACE_ROOT", Path(__file__).resolve().parents[2]))
DATA = ROOT / "data"
RAW = DATA / "raw"            # collector output, one JSONL per run (gitignored)
PRIVATE = DATA / "private"    # anything with personal data (gitignored)
INTERIM = DATA / "interim"    # classified / extracted records (gitignored)
LABELS = DATA / "labels"      # human review queues and corrections
MODELS = ROOT / "models"
WEB_DATA = ROOT / "web" / "data"  # the ONLY public output; must pass privacy checks
RESOURCES = Path(__file__).resolve().parent / "resources"

# Folder holding the WCS-OWT training CSVs. Point this at your own copy.
WCS_OWT_DIR = Path(os.environ.get("WILDTRACE_WCS_OWT_DIR", DATA / "private" / "wcs_owt"))

USER_AGENT = os.environ.get(
    "WILDTRACE_USER_AGENT",
    "WildTrace/0.1 (+https://github.com/; research OSINT; polite crawler)",
)
REQUEST_DELAY_S = float(os.environ.get("WILDTRACE_DELAY", "5"))


def ensure_dirs() -> None:
    for d in (RAW, PRIVATE, INTERIM, LABELS, MODELS, WEB_DATA):
        d.mkdir(parents=True, exist_ok=True)
