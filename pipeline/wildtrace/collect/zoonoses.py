"""Zoonoses: which traded species carry relatives of human viruses, and where animal-borne
outbreaks are reported. Two open sources, fetched fresh on every run:

* VIRION, the Global Virome in One Network (Carlson et al. 2022, mBio 13:e02985-21;
  data package on Zenodo, concept DOI 10.5281/zenodo.15643003). ODbL: the per-group
  counts published from it stay under ODbL and carry the citation.
* WHO Disease Outbreak News (public API), 1996 to today.

Only virus detections by PCR/sequencing or isolation are counted; antibodies alone show
past exposure, not the virus. A "close relative" is a virus in a genus that also holds a
virus recorded in people. None of this measures risk: that depends on contact.

    wildtrace zoonoses [--offline]
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import requests

from ..config import RAW, RESOURCES, USER_AGENT, WEB_DATA
from .cites import taxon_index

Z = RAW / "zoonoses"
VIRION_CONCEPT = "15643003"
WHO_API = "https://www.who.int/api/news/diseaseoutbreaknews"
WHO_ITEM = "https://www.who.int/emergencies/disease-outbreak-news/item/"
STRONG = {"PCR/Sequencing", "Isolation/Observation"}
FAMILIES = ["coronaviridae", "paramyxoviridae", "orthomyxoviridae", "flaviviridae", "poxviridae", "filoviridae",
            "rhabdoviridae", "retroviridae", "picornaviridae", "hantaviridae", "herpesviridae", "hepeviridae"]

# How the pathogen reaches people. Only diseases with an animal reservoir are kept; the
# first matching rule wins, so the specific names come before the general ones.
DISEASES = [
    (r"ebola|sudan virus|bundibugyo", "Ebola and Sudan virus disease", "wildlife"),
    (r"marburg", "Marburg virus disease", "wildlife"),
    (r"monkeypox|mpox", "Mpox", "wildlife"),
    (r"severe acute respiratory syndrome|\bsars\b", "SARS", "wildlife"),
    (r"covid|novel coronavirus|sars-cov-2", "COVID-19", "wildlife"),
    (r"nipah", "Nipah virus", "wildlife"),
    (r"hendra", "Hendra virus", "wildlife"),
    (r"lassa", "Lassa fever", "wildlife"),
    (r"hantavirus|hantaan", "Hantavirus", "wildlife"),
    (r"plague", "Plague", "wildlife"),
    (r"rabies", "Rabies", "wildlife"),
    (r"tularaemia|tularemia", "Tularaemia", "wildlife"),
    (r"psittacosis", "Psittacosis", "birds"),
    (r"avian influenza|h5n1|h7n9|h5n6|h9n2|h10n3|h5n8|h3n8|h10n8|h7n7", "Avian influenza", "birds"),
    (r"west nile", "West Nile fever", "birds"),
    (r"middle east respiratory|\bmers\b", "MERS", "livestock"),
    (r"rift valley", "Rift Valley fever", "livestock"),
    (r"crimean|cchf", "Crimean-Congo haemorrhagic fever", "livestock"),
    (r"anthrax", "Anthrax", "livestock"),
    (r"swine|pandemic.*2009|h1n1|variant virus|h3n2v|h1n2v", "Swine-origin influenza", "livestock"),
    (r"q fever|brucell", "Q fever and brucellosis", "livestock"),
    (r"yellow fever", "Yellow fever", "vector"),
    (r"oropouche", "Oropouche fever", "vector"),
    (r"kyasanur", "Kyasanur Forest disease", "vector"),
    (r"japanese encephalitis", "Japanese encephalitis", "vector"),
]
PATHWAYS = {"wildlife": "Wildlife contact", "birds": "Birds", "livestock": "Livestock", "vector": "Insects and ticks"}


def _get(url: str, **kw) -> requests.Response:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=120, **kw)
    r.raise_for_status()
    return r


def fetch(offline: bool = False) -> None:
    """Refresh the raw files in data/raw/zoonoses (skipped with --offline)."""
    Z.mkdir(parents=True, exist_ok=True)
    if offline:
        return
    rec = _get(f"https://zenodo.org/api/records/{VIRION_CONCEPT}").json()   # resolves to the latest version
    files = {f["key"]: f["links"]["self"] for f in rec.get("files", [])}
    for key in ("virion.csv.gz", "tax_table.csv.gz"):
        (Z / key).write_bytes(_get(files[key]).content)
    (Z / "virion_version.json").write_text(json.dumps({"doi": rec.get("doi"), "date": rec["metadata"].get("publication_date"),
                                                        "title": rec["metadata"].get("title")}), encoding="utf-8")
    items, skip = [], 0
    while True:
        page = _get(WHO_API, params={"$top": 100, "$skip": skip, "$orderby": "PublicationDate desc",
                                     "$select": "Title,OverrideTitle,UseOverrideTitle,PublicationDate,UrlName"}).json()["value"]
        if not page:
            break
        items += page; skip += 100; time.sleep(0.5)
    (Z / "who_don.json").write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")


def _rows(name: str):
    return csv.DictReader(io.TextIOWrapper(gzip.open(Z / name), encoding="utf-8", errors="replace"))


def virus_groups() -> dict:
    species, higher = taxon_index()
    tax = {r["TaxHashID"]: r for r in _rows("tax_table.csv.gz")}

    def group(t):
        g = species.get(t["ScientificName"])
        if g:
            return g
        for col in ("Genus", "Family", "Order"):
            g = higher.get(t[col])
            if g:
                return g
        return None

    found, human, human_genera, fam, gen = defaultdict(set), set(), set(), {}, {}
    for r in _rows("virion.csv.gz"):
        if r["DetectionMethod"] not in STRONG:
            continue
        h, v = tax.get(r["HostTaxHashID"]), tax.get(r["VirusTaxHashID"])
        if not h or not v or not v["ScientificName"]:
            continue
        name = v["ScientificName"]; fam[name] = v["Family"]; gen[name] = v["Genus"]
        if h["ScientificName"] == "homo sapiens":
            human.add(name)
            if v["Genus"]:
                human_genera.add(v["Genus"])
            continue
        g = group(h)
        if g:
            found[g].add(name)
    out = {}
    for g, vs in found.items():
        same = vs & human
        rel = {x for x in vs if gen.get(x) and gen[x] in human_genera}
        out[g] = {"viruses": len(vs), "same": len(same), "relatives": len(rel),
                  "families": {f: sum(1 for x in rel if fam[x] == f) for f in FAMILIES if any(fam[x] == f for x in rel)},
                  "genera": sorted({gen[x] for x in rel})[:16]}
    return out


def _country_names() -> dict[str, str]:
    names = {}
    for cc, c in json.loads((WEB_DATA / "countries.json").read_text(encoding="utf-8")).items():
        names[c["name"]] = cc
    names.update(json.loads((RESOURCES / "country_aliases.json").read_text(encoding="utf-8")))
    return names


def outbreaks() -> list[dict]:
    names = _country_names()
    pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True) if len(n) > 3) + r")\b")
    seen = {}
    for x in json.loads((Z / "who_don.json").read_text(encoding="utf-8")):
        title = (x.get("OverrideTitle") if x.get("UseOverrideTitle") and x.get("OverrideTitle") else x.get("Title") or "").strip()
        seen[x["UrlName"]] = (x["PublicationDate"][:10], title)
    rows = []
    for uid, (date, title) in seen.items():
        low = title.lower()
        hit = next(((lab, pw) for rx, lab, pw in DISEASES if re.search(rx, low)), None)
        if not hit:
            continue
        ccs = {names[m] for m in pat.findall(title)}
        # "Guinea" alone: not Papua New Guinea, Equatorial Guinea or Guinea-Bissau
        if re.search(r"(?<!New )(?<!Equatorial )\bGuinea\b(?!-Bissau)", title):
            ccs.add("GN")
        rows.append({"id": uid, "date": date, "disease": hit[0], "pathway": hit[1], "countries": sorted(ccs), "title": title})
    return sorted(rows, key=lambda r: r["date"], reverse=True)


def build(offline: bool = False) -> Path:
    fetch(offline)
    ver = json.loads((Z / "virion_version.json").read_text(encoding="utf-8")) if (Z / "virion_version.json").exists() else {}
    obs = outbreaks()
    by_country = defaultdict(Counter)
    for r in obs:
        for c in r["countries"]:
            by_country[c][r["pathway"]] += 1
    data = {
        "virion": {"doi": ver.get("doi"), "date": ver.get("date"), "licence": "ODbL-1.0",
                   "cite": "Carlson CJ et al. (2022) The Global Virome in One Network (VIRION): an atlas of vertebrate-virus "
                           "associations. mBio 13:e02985-21. doi:10.1128/mbio.02985-21",
                   "evidence": "PCR/sequencing or isolation only", "groups": virus_groups()},
        "who": {"source": "WHO Disease Outbreak News", "url": WHO_ITEM, "pathways": PATHWAYS,
                "by_country": {c: dict(v) for c, v in by_country.items()},
                "reports": [{k: r[k] for k in ("id", "date", "disease", "pathway", "countries")} for r in obs]},
        "note": "These layers share a map, not a cause. An outbreak near a seizure does not mean the trade caused it.",
    }
    path = WEB_DATA / "zoonoses.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with open(WEB_DATA / "zoonotic_outbreak_reports.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "disease", "pathway", "countries", "who_report_url"])
        w.writerows([r["date"], r["disease"], r["pathway"], " ".join(r["countries"]), WHO_ITEM + r["id"]] for r in obs)
    with open(WEB_DATA / "species_viruses.csv", "w", newline="", encoding="utf-8") as f:   # ODbL 1.0 (VIRION)
        w = csv.writer(f)
        w.writerow(["species_group", "viruses_confirmed", "same_virus_as_in_people", "close_relatives_of_human_viruses", *FAMILIES])
        w.writerows([g, x["viruses"], x["same"], x["relatives"], *[x["families"].get(fm, 0) for fm in FAMILIES]]
                    for g, x in sorted(data["virion"]["groups"].items()))
    print(f"zoonoses: {len(data['virion']['groups'])} species groups with viruses, {len(obs)} zoonotic WHO reports "
          f"({sum(1 for r in obs if r['countries'])} placed) -> {path}")
    return path
