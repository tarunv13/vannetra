"""Fetch the lede of a news article so extraction sees more than the headline.

GDELT returns titles only, and a headline like "DRI seizes 440+ endangered
animals" often omits the place. This fetches the page (robots.txt respected,
cached, polite delay), takes the meta description plus the first paragraphs,
and stores them in the private raw record. Article text is never published.
Uses trafilatura when installed, else a small standard-library HTML parser.
"""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser

from .base import get

MAX_CHARS = 2000


class _Paras(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta, self.paras, self._in_p, self._buf, self._skip = "", [], False, [], 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and (a.get("property") in ("og:description",) or a.get("name") == "description") and not self.meta:
            self.meta = a.get("content") or ""
        if tag in ("script", "style", "nav", "footer", "header", "aside"):
            self._skip += 1
        if tag == "p" and not self._skip:
            self._in_p, self._buf = True, []

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "header", "aside") and self._skip:
            self._skip -= 1
        if tag == "p" and self._in_p:
            t = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if len(t) > 60:
                self.paras.append(t)
            self._in_p = False

    def handle_data(self, data):
        if self._in_p and not self._skip:
            self._buf.append(data)


def lede(url: str) -> str:
    r = get(url, delay=3, timeout=25)
    if r is None or not r.ok or "html" not in r.headers.get("content-type", "text/html"):
        return ""
    try:
        import trafilatura  # optional, better boilerplate removal
        text = trafilatura.extract(r.text, include_comments=False, include_tables=False) or ""
        if text:
            return text[:MAX_CHARS]
    except ImportError:
        pass
    p = _Paras()
    try:
        p.feed(r.text)
    except Exception:
        return ""
    text = " ".join([html.unescape(p.meta)] + p.paras[:6])
    return text[:MAX_CHARS].strip()
