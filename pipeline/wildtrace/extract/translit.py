"""Match Hindi (Devanagari) place words to the Latin gazetteer.

Hindi news spells districts and towns that GeoNames lists only in Latin script
(कुशीनगर, सीधी, धनबाद …). A word in a place position, i.e. just before a
postposition (में, के, से, की, का, जिले, ज़िले) or a dateline colon, is
transliterated and compared with Indian gazetteer names by *consonant skeleton*:
vowels, aspiration and doubled letters are dropped, so spelling variants of the
same name collapse to one key (कुशीनगर → kushinagar → ksngr ← Kushinagar).
"""
from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from functools import lru_cache

CONS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "ळ": "l", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f",
}
VOWELS = {"अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri"}
SIGNS = {"ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri",
         "ं": "n", "ँ": "n", "ः": "h", "्": "", "़": ""}

POSTPOSITIONS = ("में", "के", "से", "की", "का", "को", "जिले", "ज़िले", "जिला", "ज़िला", "पर", "तक")
DEV_WORD = re.compile(r"[ऀ-ॿ]+")

# Nouns that sit before a postposition in crime reports but are not places.
# Loanwords (रैकेट "racket", स्टेशन "station") otherwise skeleton-match real towns.
STOP = set("""
मामले मामला रैकेट गिरोह तस्करी तस्कर जंगल स्टेशन बस ट्रेन कार घर गांव गाँव शहर इलाके इलाका थाना थाने क्षेत्र पुलिस वन विभाग
टीम कार्रवाई खाल शल्क कछुआ कछुए कछुओं तोते तोता सांप साँप हाथी बाघ तेंदुए तेंदुआ उल्लू हिरण गैंडे पैंगोलिन दांत सींग
आरोपी आरोपियों लोगों लोग युवक युवकों महिला व्यक्ति सूचना जांच जाँच छापे छापेमारी बाजार बाज़ार होटल मंदिर मस्जिद
नदी तालाब सड़क रास्ते बॉर्डर सीमा एयरपोर्ट हवाई अड्डे कोर्ट अदालत जेल रिमांड वीडियो रील सोशल मीडिया ऑनलाइन
प्रजाति वन्यजीव जीव जानवर पक्षी मछली शिकार शिकारी बिक्री कीमत करोड़ लाख रुपये किलो ग्राम
भारत देश विदेश राज्य प्रदेश जिला जिले राजधानी सरकार
""".split())


def transliterate(word: str) -> str:
    word = unicodedata.normalize("NFC", word)
    out, i = [], 0
    while i < len(word):
        c = word[i]
        nxt = word[i + 1] if i + 1 < len(word) else ""
        if c + nxt in CONS:  # nukta consonants
            c, i = c + nxt, i + 1
            nxt = word[i + 1] if i + 1 < len(word) else ""
        if c in CONS:
            out.append(CONS[c])
            # inherent vowel unless a sign/virama follows or it is the last letter
            if nxt and nxt not in SIGNS and nxt in CONS or (nxt and nxt[0] in CONS):
                out.append("a")
        elif c in VOWELS:
            out.append(VOWELS[c])
        elif c in SIGNS:
            out.append(SIGNS[c])
        i += 1
    return "".join(out)


def _ascii(name: str) -> str:
    return "".join(ch for ch in unicodedata.normalize("NFKD", name.lower()) if ch.isascii() and ch.isalpha())


def skeleton(latin: str) -> str:
    s = unicodedata.normalize("NFKD", latin.lower())
    s = "".join(ch for ch in s if ch.isascii() and ch.isalpha())
    for a, b in (("sh", "s"), ("ph", "f"), ("v", "w"), ("z", "j"), ("q", "k"), ("x", "ks")):
        s = s.replace(a, b)
    s = re.sub(r"(?<=[bcdfgjklmnpqrstwxyz])h", "", s)  # drop aspiration, keep an initial h
    s = re.sub(r"[aeiouy]", "", s)
    return re.sub(r"(.)\1+", r"\1", s)


@lru_cache(maxsize=1)
def _index():
    from .events import gazetteer  # late import: events imports this module
    rank = {"district": 0, "city": 1, "park": 2, "state": 3}
    idx: dict[str, object] = {}
    seen = set()
    for places in gazetteer().values():
        for p in places:
            if p.country != "IN" or p.name in seen or p.type not in rank:
                continue
            seen.add(p.name)
            k = skeleton(p.name)
            if len(k) < 2:
                continue
            cur = idx.get(k)
            if cur is None or rank[p.type] < rank[cur.type]:
                idx[k] = p
    return idx


@lru_cache(maxsize=1)
def _native_names() -> set[str]:
    """Words the native-name index already resolves (e.g. भारत → India): never transliterate them."""
    from .events import _gazetteer_all
    return {n for n, _ in _gazetteer_all()[1]}


def find_hindi_places(text: str) -> list[tuple[int, object]]:
    out = []
    words = [(m.start(), m.end(), m.group(0)) for m in DEV_WORD.finditer(text)]
    for i, (a, b, w) in enumerate(words):
        after = text[b:b + 2]
        nxt = words[i + 1][2] if i + 1 < len(words) else ""
        dateline = after.startswith(":")
        if not (dateline or nxt in POSTPOSITIONS):
            continue
        if w in STOP or w in _native_names():
            continue
        lat = transliterate(w)
        k = skeleton(lat)
        if len(k) < 3 and not dateline:  # 2-consonant keys only in datelines ("सीधी:")
            continue
        p = _index().get(k)
        # Consonants agree; the vowels must broadly agree too.
        if p is not None and SequenceMatcher(None, lat, _ascii(p.name)).ratio() >= 0.72:
            out.append((a, p))
    return out
