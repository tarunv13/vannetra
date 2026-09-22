"""Privacy guardrails.

Rule of the project: *nothing that identifies a private person is ever published*.
News reports name accused people who are presumed innocent, and trade listings
carry sellers' phone numbers. The public site shows events, species, places,
agencies and outlets. Person-level analysis happens only inside the browser
workbench, on data the analyst loads themselves, and never leaves their machine.

India's Digital Personal Data Protection Act 2023 and the presumption of
innocence are the reasons. See docs/ETHICS_PRIVACY.md.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

# Phone numbers: Indian mobiles (+91 / 0 / bare 10 digits starting 6-9) and
# generic international numbers with 8+ digits and separators.
_PHONE = re.compile(
    r"(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)"
    r"|(?<!\d)\+\d{1,3}[\s-]?(?:\d[\s-]?){7,12}\d(?!\d)"
)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_HANDLE = re.compile(r"(?<![\w@])@[A-Za-z0-9_.]{3,30}")
_WA_LINK = re.compile(r"(?:https?://)?(?:wa\.me|chat\.whatsapp\.com|t\.me)/\S+", re.I)

# Fields that may carry identities and must never reach web/data.
HASH_KEYS = {"id", "record_id"}  # generated hex identifiers, never free text
BLOCKED_KEYS = {"channel", "channelname", "channel_name", "author", "persons", "person", "phone", "email", "uploader", "uploader_id"}


def scrub(text: str) -> str:
    """Remove contact details from free text."""
    if not text:
        return text
    text = _WA_LINK.sub("[link removed]", text)
    text = _EMAIL.sub("[email removed]", text)
    text = _PHONE.sub("[phone removed]", text)
    text = _HANDLE.sub("[handle removed]", text)
    return text


def find_pii(text: str) -> list[str]:
    hits: list[str] = []
    for rx in (_PHONE, _EMAIL, _WA_LINK):
        hits += rx.findall(text or "")
    return hits


def assert_public_safe(rows: Iterable[dict[str, Any]], where: str = "") -> None:
    """Raise if anything that looks like personal data is about to be published."""
    for i, row in enumerate(rows):
        bad_keys = BLOCKED_KEYS & {k.lower() for k in row}
        if bad_keys:
            raise ValueError(f"{where}[{i}] carries blocked field(s) {sorted(bad_keys)}")
        for k, v in row.items():
            if k in HASH_KEYS:
                continue  # hex digests can contain 10-digit runs that look like phone numbers
            if isinstance(v, str) and find_pii(v):
                raise ValueError(f"{where}[{i}].{k} contains contact details: {find_pii(v)[:2]}")
