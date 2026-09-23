"""Outlet and organisation logos, self-hosted.

Every source is shown with its outlet's icon, and every observatory with its organisation's, so a
reader recognises who is speaking. Google News hides the publisher behind a redirect, but its RSS
names the publisher's home page (<source url>), kept by the collector as extra.source_url; that
gives the domain. Icons are fetched once, at build time, from DuckDuckGo's icon service, shrunk
to 32 px PNG and served from web/logos/: a reader's browser never contacts a third party for them.
Icons identify a source (nominative use); they are not WildTrace's and carry no endorsement.
"""
from __future__ import annotations

import io
import json
import re
from collections import Counter, defaultdict
from urllib.parse import urlparse

import requests

from .config import RAW, USER_AGENT, WEB_DATA

LOGOS = WEB_DATA.parent / "logos"
ICON = "https://icons.duckduckgo.com/ip3/{}.ico"


def _domain(url: str) -> str:
    host = urlparse(url or "").netloc.lower()
    return re.sub(r"^(www|m|amp)\.", "", host)


def outlet_domains() -> dict[str, str]:
    """outlet name -> publisher domain, voted across every collected record."""
    votes: dict[str, Counter] = defaultdict(Counter)
    for f in RAW.glob("*.jsonl"):
        for line in f.open(encoding="utf-8"):
            try:
                r = json.loads(line)
            except ValueError:
                continue
            outlet = r.get("outlet")
            if not outlet:
                continue
            ex = r.get("extra") or {}
            if isinstance(ex, str):
                try:
                    ex = json.loads(ex)
                except ValueError:
                    ex = {}
            d = _domain(ex.get("source_url", "")) or ("" if "news.google." in r.get("url", "") else _domain(r.get("url", "")))
            if d:
                votes[outlet][d] += 1
    return {o: c.most_common(1)[0][0] for o, c in votes.items()}


def fetch_icons(domains: set[str], limit: int = 400) -> int:
    """Download icons for domains that have none yet. Returns how many were added."""
    from PIL import Image
    LOGOS.mkdir(parents=True, exist_ok=True)
    have = {p.stem for p in LOGOS.glob("*.png")} | {p.stem for p in LOGOS.glob("*.none")}
    added = 0
    for d in sorted(domains - have)[:limit]:
        try:
            r = requests.get(ICON.format(d), headers={"User-Agent": USER_AGENT}, timeout=20)
            if r.status_code != 200 or len(r.content) < 100:
                raise ValueError("no icon")
            im = Image.open(io.BytesIO(r.content))
            if getattr(im, "n_frames", 1) > 1:       # .ico files hold several sizes: take the largest
                sizes = sorted(im.info.get("sizes", []) or [im.size])
                if sizes:
                    im.size = sizes[-1]
            im = im.convert("RGBA").resize((32, 32), Image.LANCZOS)
            im.save(LOGOS / f"{d}.png", optimize=True)
            added += 1
        except Exception:
            (LOGOS / f"{d}.none").write_text("")    # remember the miss; the page falls back to a letter
    return added


def update(cases: list[dict], observatories: list[dict]) -> dict[str, str]:
    """Write web/data/outlets.json (outlet -> domain with an icon) and fetch missing icons."""
    names = outlet_domains()
    used = {s.get("outlet") for c in cases for s in c.get("sources", []) if s.get("outlet")}
    for c in cases:                                  # direct links (official releases) name their own domain
        for s in c.get("sources", []):
            if s.get("outlet") and s["outlet"] not in names and "news.google." not in s.get("url", ""):
                names[s["outlet"]] = _domain(s["url"])
    out = {o: names[o] for o in used if o in names}
    obs = {o["id"]: _domain(o["url"]) for o in observatories if o.get("url")}
    added = fetch_icons(set(out.values()) | set(obs.values()))
    have = {p.stem for p in LOGOS.glob("*.png")}
    data = {"outlets": {o: d for o, d in out.items() if d in have},
            "observatories": {k: d for k, d in obs.items() if d in have}}
    (WEB_DATA / "outlets.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  logos: {len(data['outlets'])} of {len(used)} outlets, {len(data['observatories'])} observatories (+{added} new icons)")
    return data["outlets"]
