"""Build resources/gazetteer_geonames.csv from GeoNames (CC-BY 4.0, geonames.org).

    vannetra gazetteer            # downloads cities1000 + admin1 codes, writes the CSV

Keeps populated places of >= 1,000 people (district towns included) in the observatory's countries, plus
state/province centroids. Names that are also ordinary English words, species
or agency terms are dropped, because Title-Case headlines would otherwise
geocode "Tiger" or "Police" as towns.
"""
from __future__ import annotations

import csv
import io
import zipfile
from collections import defaultdict

from .. import lexicon
from ..collect.base import get
from ..config import RAW, RESOURCES

BASE = "https://download.geonames.org/export/dump/"
SCOPE = {"IN", "NP", "BD", "LK", "BT", "PK", "MM", "TH", "VN", "LA", "KH", "MY", "SG", "ID", "PH", "CN", "HK", "AE"}
STOP = {
    "Police", "Forest", "Customs", "Tiger", "Leopard", "Elephant", "Ivory", "Deer", "Bear", "Owl", "Turtle", "Snake",
    "Cobra", "Lion", "Star", "Gold", "Silver", "Rose", "Dam", "Port", "Station", "Airport", "Central", "Union", "State",
    "North", "South", "East", "West", "New", "Old", "Nagar", "City", "Town", "Market", "Bazar", "Bazaar", "Road",
    "Court", "High", "Supreme", "Minister", "Chief", "Officer", "Range", "Beat", "Division", "Circle", "Zone",
    "Sale", "Price", "Test", "Real", "Original", "Man", "Men", "Women", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Many", "More", "Most", "Some", "Part", "Parts", "Live", "Dead", "Rare", "Wild",
    "Wildlife", "Crime", "Bureau", "Nature", "Green", "Red", "Black", "White", "Blue", "Asian", "Indian", "Bengal",
    "Hindu", "Muslim", "Sikh", "Christian", "March", "May", "June", "July", "August", "Mon", "Sun", "Pan", "Kota",
    "Bus", "Car", "Train", "Truck", "Sea", "Bay", "Lake", "River", "Island", "Hill", "Hills", "Valley", "Park",
    "Reserve", "Sanctuary", "Flora", "Fauna", "Species", "Animal", "Animals", "Endangered", "Temple", "Palace", "Fort", "Chowk", "Gate", "Tank", "Pond", "Well", "Village",
}


def _text(url: str) -> bytes:
    r = get(url, delay=1, check_robots=False, cache_hours=24 * 30, timeout=120)
    if r is None or not r.ok:
        raise RuntimeError(f"download failed: {url}")
    return r.content


def build() -> int:
    admin1 = {}
    for line in _text(BASE + "admin1CodesASCII.txt").decode("utf-8").splitlines():
        code, name, *_ = line.split("\t")
        admin1[code] = name
    z = zipfile.ZipFile(io.BytesIO(_text(BASE + "cities1000.zip")))
    rows = z.read("cities1000.txt").decode("utf-8").splitlines()

    lex_words = {t.lower() for g in lexicon.load()["groups"].values() for ts in g["terms"].values() for t in ts}
    stop = {s.lower() for s in STOP} | lex_words
    best: dict[tuple[str, str], tuple] = {}
    for line in rows:
        f = line.split("\t")
        name, cc, pop = f[1], f[8], int(f[14] or 0)
        if cc not in SCOPE or len(name) < 4 or name.lower() in stop or not name[0].isupper():
            continue
        a1 = admin1.get(f"{cc}.{f[10]}", "")
        key = (name, cc)
        if key not in best or pop > best[key][6]:  # keep the most populous homonym per country
            alias = f[2] if f[2] != name and f[2].lower() not in stop else ""
            best[key] = (name, "city", cc, a1, round(float(f[4]), 4), round(float(f[5]), 4), pop, alias)

    # India: every district / sub-district seat and district centroid, whatever its
    # recorded population (GeoNames stores 0 for many district towns, e.g. Malkangiri).
    zin = zipfile.ZipFile(io.BytesIO(_text(BASE + "IN.zip")))
    for line in zin.read("IN.txt").decode("utf-8").splitlines():
        f = line.split("	")
        if f[7] not in ("PPLA", "PPLA2", "PPLA3", "ADM2"):
            continue
        name = f[1].replace(" District", "").strip()
        if len(name) < 4 or name.lower() in stop or not name[0].isupper() or (name, "IN") in best:
            continue
        typ = "district" if f[7] == "ADM2" else "city"
        best[(name, "IN")] = (name, typ, "IN", admin1.get(f"IN.{f[10]}", ""), round(float(f[4]), 4),
                              round(float(f[5]), 4), int(f[14] or 0), f[2] if f[2] != name else "")

    out = RESOURCES / "gazetteer_geonames.csv"
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["name", "aliases", "type", "country", "admin1", "lat", "lon", "population"])
        for (name, cc), r in sorted(best.items(), key=lambda kv: -kv[1][6]):
            w.writerow([r[0], r[7], r[1], r[2], r[3], r[4], r[5], r[6]])
    print(f"gazetteer: {len(best)} places -> {out}  (GeoNames, CC-BY 4.0)")
    return len(best)
