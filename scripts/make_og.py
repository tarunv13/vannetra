"""Render web/og.png, the card shown when a WildTrace link is shared.

The card is a screenshot of the real Atlas with the panels hidden and a title
block drawn over it, so it always carries the current case and country counts
and never drifts from the site. Run it after a build:

    python scripts/make_og.py            # writes web/og.png

Needs Playwright with Chromium (``pip install playwright && playwright install
chromium``). If either is missing, the script says so and leaves the existing
card in place, so a build without a browser still succeeds.
"""
from __future__ import annotations

import http.server
import json
import os
import socketserver
import sys
import threading
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
OUT = WEB / "og.png"
PORT = 8799


def counts() -> tuple[str, str]:
    """Cases and countries as they appear in the published data."""
    cases = json.loads((WEB / "data" / "cases.json").read_text(encoding="utf-8"))
    cases = cases if isinstance(cases, list) else cases.get("cases", [])
    countries = {c["place"]["country"] for c in cases if c.get("place") and c["place"].get("country")}
    return f"{len(cases):,}", f"{len(countries)}"


# The title block, drawn over the globe. Kept large: a shared card is about
# 500 px wide in a feed, so small print is unreadable where it matters.
OVERLAY = """({ cases, countries }) => {
  document.querySelectorAll('header, .topbar, #pulse, .pulse, .timeline, #timeline, .legend, .mapctl,'
    + ' .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left, .toast, .dock, .tour, .guide, .guide-card-cta, .trivia, #trivia-root, .flowside, .inspector').forEach((e) => (e.style.display = 'none'));
  document.getElementById('globe').style.transform = 'translateX(120px)';
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:70px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;'
    + 'gap:26px;z-index:99;width:560px;font-family:"Bricolage Grotesque",sans-serif;color:#17312b';
  d.innerHTML = `<div style="display:flex;align-items:center;gap:18px">
      <svg width="86" height="86" style="color:#17312b"><use href="#logo"/></svg>
      <div style="font-size:78px;font-weight:800;letter-spacing:-.025em"><span style="color:#0f7a5c">Wild</span>Trace</div></div>
    <div style="font-size:44px;font-weight:600;line-height:1.1;letter-spacing:-.015em">The open atlas of illegal wildlife trade</div>
    <div style="font-family:Geist,sans-serif;font-size:29px;font-weight:500;color:#3c4a45;line-height:1.35">
      ${cases} cases &middot; ${countries} countries<br>Open data, CC BY 4.0</div>`;
  document.body.append(d);
}"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def log_message(self, *a):  # keep the build log readable
        pass


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("make_og: playwright is not installed; keeping the existing card")
        return 0
    n_cases, n_countries = counts()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as srv:
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                # WILDTRACE_CHROMIUM points at a Chromium if Playwright's own copy is elsewhere.
                exe = os.environ.get("WILDTRACE_CHROMIUM") or None
                b = p.chromium.launch(executable_path=exe,
                                      args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
                pg = b.new_page(viewport={"width": 1200, "height": 630})
                pg.add_init_script("try { localStorage.setItem('wildtrace.tour.v2', 'done'); localStorage.setItem('wildtrace.guide', 'seen') } catch (e) {}")  # no walkthrough on the card
                pg.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle", timeout=60000)
                pg.wait_for_timeout(4000)      # let the globe draw and the markers settle
                pg.evaluate(OVERLAY, {"cases": n_cases, "countries": n_countries})
                pg.wait_for_timeout(1500)
                pg.screenshot(path=str(OUT))
                b.close()
        except Exception as e:  # a missing browser binary, or a render failure
            print(f"make_og: could not render the card ({e}); keeping the existing one")
            return 0
        finally:
            srv.shutdown()
    print(f"make_og: {OUT} — {n_cases} cases, {n_countries} countries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
