"""Tell search engines which pages changed, through IndexNow (Bing, Yandex, Naver, Seznam).

    python scripts/indexnow.py            # every URL in web/sitemap.xml
    python scripts/indexnow.py --changed  # only pages changed in the last commit (the daily run)

The key is public by design: its file, web/<key>.txt, proves the submission comes from this
site. The site lives under /wildtrace/, so the key file sits there and keyLocation points to it;
IndexNow then accepts URLs under that path.
"""
from __future__ import annotations

import json
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

SITE = "https://tarunv13.github.io/wildtrace/"
HOST = "tarunv13.github.io"
WEB = Path(__file__).resolve().parents[1] / "web"
KEY = next(p.stem for p in WEB.glob("*.txt") if len(p.stem) == 32 and p.read_text().strip() == p.stem)


def sitemap_urls() -> list[str]:
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [e.text for e in ET.parse(WEB / "sitemap.xml").getroot().findall("s:url/s:loc", ns)]


def changed_urls() -> list[str]:
    out = subprocess.run(["git", "diff", "--name-only", "HEAD~1", "HEAD", "--", "web"], capture_output=True, text=True).stdout
    urls = []
    for f in out.split():
        rel = f.removeprefix("web/")
        if rel.endswith(".html") and not rel.startswith("google"):
            urls.append(SITE + ("" if rel == "index.html" else rel))
        elif rel.startswith("data/"):
            urls.append(SITE)     # the Atlas itself shows the new data
    return sorted(set(urls))


def submit(urls: list[str]) -> None:
    for i in range(0, len(urls), 10000):
        body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"{SITE}{KEY}.txt", "urlList": urls[i:i + 10000]}).encode()
        req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(f"IndexNow: {len(urls[i:i + 10000])} URLs -> HTTP {r.status}")
        except urllib.error.HTTPError as e:   # 422 = URL outside the key's scope, 429 = too often
            print(f"IndexNow: HTTP {e.code} {e.read()[:200]!r}")


if __name__ == "__main__":
    urls = changed_urls() if "--changed" in sys.argv else sitemap_urls()
    if urls:
        submit(urls)
    else:
        print("IndexNow: nothing changed")
