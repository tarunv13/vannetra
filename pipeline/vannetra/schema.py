"""Common record format shared by every collector, the classifier and the publisher."""
from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class Record:
    url: str
    title: str
    text: str = ""
    source: str = ""          # collector id, e.g. "gdelt", "gnews", "youtube"
    outlet: str = ""          # publisher domain or channel
    published: str = ""       # ISO date (YYYY-MM-DD) when known
    lang: str = ""
    country_hint: str = ""    # ISO-2 of the query/source, not of the event
    kind: str = "news"        # news | listing | court | official | video
    query: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def id(self) -> str:
        return hashlib.sha1(self.url.strip().lower().encode("utf-8")).hexdigest()[:16]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["id"] = self.id
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Record":
        keys = cls.__dataclass_fields__.keys()
        return cls(**{k: v for k, v in d.items() if k in keys})
