"""Source tiers: how much weight a report carries.

  official  a government, enforcement, customs, coast-guard, judicial or
            intergovernmental body reporting its own action (gov.br, gob.mx,
            justice.gov, info.gov.hk, go.id, interpol.int ...). About a third of
            the WCS Brasil observatory's source domains are of this kind.
  ngo       conservation and monitoring organisations (TRAFFIC, WCS, EIA ...)
  media     news outlets
The tier is decided from the publisher's domain only, never from the text.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

OFFICIAL = re.compile(
    r"(^|\.)(gov|gob|go|gouv|govt|gc|mil|nic|police|policia|judicial|justicia|mpf|mp)\.[a-z]{2,3}$"  # gov.br, gob.mx, go.id, nic.in
    r"|(^|\.)gov$|\.gov\.[a-z]{2}$|\.gob\.[a-z]{2}$|\.go\.[a-z]{2}$|\.gouv\.[a-z]{2}$"
    r"|(^|\.)(europa\.eu|interpol\.int|unodc\.org|cites\.org|wcoomd\.org|un\.org)$"
    r"|(^|\.)(fws\.gov|justice\.gov|ice\.gov|cbp\.gov|noaa\.gov|government\.nl|admin\.ch|bund\.de)$")
NGO = re.compile(r"(^|\.)(traffic\.org|wcs\.org|wwf\.[a-z.]+|worldwildlife\.org|eia-international\.org|wildlifejustice\.org|"
                 r"env4wildlife\.org|freeland\.org|wildaid\.org|ifaw\.org|panthera\.org|c4ads\.org|oxpeckers\.org|"
                 r"globalinitiative\.net|earthleagueinternational\.org|wpsi-india\.org)$")


def domain(url_or_host: str) -> str:
    h = urlparse(url_or_host).netloc if "://" in (url_or_host or "") else (url_or_host or "")
    return h.lower().removeprefix("www.")


def tier(url_or_host: str) -> str:
    d = domain(url_or_host)
    if not d:
        return "media"
    if OFFICIAL.search(d):
        return "official"
    if NGO.search(d):
        return "ngo"
    return "media"
