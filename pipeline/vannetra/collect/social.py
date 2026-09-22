"""Online-marketplace collectors (supply side): YouTube and an Agent Reach bridge.

Agent Reach (github.com/Panniantong/agent-reach, MIT) does not wrap platforms in
its own API. It installs and health-checks upstream CLIs (yt-dlp, gh, feed
readers, twitter-cli, ...) and lets an agent call them directly. This module
follows the same idea: it asks ``agent-reach doctor`` what is healthy (when
installed) and then shells out to the upstream tool.

Only public metadata is collected. Channel names and phone numbers are kept in
data/raw (gitignored) for the classifier and the analyst's local workbench.
They never reach web/data; privacy.assert_public_safe enforces that.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime

from .. import lexicon
from ..schema import Record


def agent_reach_channels() -> dict[str, bool]:
    exe = shutil.which("agent-reach")
    if not exe:
        return {}
    try:
        out = subprocess.run([exe, "doctor", "--json"], capture_output=True, text=True, timeout=120).stdout
        data = json.loads(out)
        return {k: bool(v.get("ok", v)) if isinstance(v, dict) else bool(v) for k, v in data.items()}
    except Exception:
        return {}


def youtube_search(query: str, n: int = 25) -> list[Record]:
    """Newest-first YouTube search, metadata only (no download).

    yt-dlp 2026.x dropped the `ytsearchdate` shortcut, so this uses YouTube's own
    results URL with the upload-date sort (`sp=CAI=`). Flat results carry no upload
    date; `published` is left empty and `extra.seen` records the collection day."""
    from urllib.parse import quote_plus
    exe = shutil.which("yt-dlp")
    if not exe:
        raise RuntimeError("yt-dlp not found: pip install yt-dlp  (or: agent-reach install)")
    url = f"https://www.youtube.com/results?search_query={quote_plus(query)}&sp=CAI%253D"
    cmd = [exe, url, "--flat-playlist", "--dump-json", "--no-warnings", "--skip-download", "--playlist-end", str(n)]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace")
    if res.returncode and not res.stdout:
        print(f"    yt-dlp: {res.stderr.strip()[:160]}")
    seen = datetime.now().strftime("%Y-%m-%d")
    out = []
    for line in res.stdout.splitlines():
        try:
            v = json.loads(line)
        except json.JSONDecodeError:
            continue
        up = v.get("upload_date") or v.get("timestamp")
        pub = ""
        if isinstance(up, str) and len(up) == 8:
            pub = f"{up[:4]}-{up[4:6]}-{up[6:]}"
        elif isinstance(up, (int, float)):
            pub = datetime.utcfromtimestamp(up).strftime("%Y-%m-%d")
        out.append(Record(url=v.get("url") or f"https://www.youtube.com/watch?v={v.get('id')}",
                          title=v.get("title", ""), text=v.get("description") or "", source="youtube",
                          outlet="youtube.com", published=pub, kind="listing", query=query,
                          extra={"channel": v.get("channel") or v.get("uploader") or "", "seen": seen}))
    return out


def collect_youtube(per_query: int = 20, groups: list[str] | None = None) -> list[Record]:
    """Search the WCS-OWT style seller phrases (e.g. 'asli kasturi ki kimat')."""
    lex = lexicon.load()["groups"]
    recs = []
    for gid in groups or lex:
        terms = lex[gid]["terms"]
        seeds = (terms.get("hi_latn") or []) + (terms.get("te_latn") or [])
        for s in seeds[:3]:
            for q in (f"{s} price", f"original {s} test"):
                try:
                    got = youtube_search(q, per_query)
                except RuntimeError as e:
                    print(" ", e); return recs
                print(f"  youtube {gid} '{q}': {len(got)}")
                recs += got
    return recs
