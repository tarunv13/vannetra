"""Species silhouettes from PhyloPic (https://www.phylopic.org), one per species group.

    python scripts/species_icons.py        # writes web/icons/species/<group>.svg + web/data/species_icons.json

For each group, the taxa below are tried in order (most recognisable first); the first with an
openly licensed silhouette wins. Only CC0, public domain, CC BY and CC BY-SA images are used,
never non-commercial ones, and each keeps its artist credit and licence (shown in About).
Groups with no suitable silhouette fall back to a product icon in the page.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

WEB = Path(__file__).resolve().parents[1] / "web"
OUT = WEB / "icons" / "species"
API = "https://api.phylopic.org"
UA = {"User-Agent": "WildTrace/1.5 (+https://github.com/tarunv13/wildtrace)"}
OPEN = re.compile(r"publicdomain|/by/|/by-sa/", re.I)   # CC0, PDM, CC BY, CC BY-SA; not -nc

TAXA = {
    "pangolin": ["Manis javanica", "Manis", "Manidae"], "musk_deer": ["Moschus", "Moschidae"],
    "monitor_lizard": ["Varanus salvator", "Varanus"], "jackal": ["Canis aureus", "Canis"],
    "sand_boa": ["Eryx", "Boidae"], "wild_boar": ["Sus scrofa", "Sus"], "turtles": ["Geochelone elegans", "Testudinidae", "Testudines"],
    "sea_fan": ["Gorgonia", "Octocorallia", "Anthozoa"], "tokay_gecko": ["Gekko gecko", "Gekko", "Gekkonidae"],
    "elephant": ["Elephas maximus", "Loxodonta africana", "Elephantidae"], "tiger": ["Panthera tigris"],
    "leopard": ["Panthera pardus"], "rhino": ["Rhinoceros unicornis", "Rhinocerotidae"], "owl": ["Bubo", "Strigiformes"],
    "birds": ["Psittacus erithacus", "Psittaciformes"], "red_sanders": ["Pterocarpus", "Fabaceae"],
    "shark_ray": ["Carcharhinus", "Selachimorpha", "Batoidea"], "primates": ["Macaca", "Primates"],
    "hornbill": ["Buceros", "Bucerotidae"], "bear": ["Ursus thibetanus", "Ursidae"], "mongoose": ["Herpestes", "Herpestidae"],
    "jaguar": ["Panthera onca"], "lion": ["Panthera leo"], "cheetah": ["Acinonyx jubatus"], "totoaba": ["Totoaba macdonaldi", "Sciaenidae"],
    "eels": ["Anguilla anguilla", "Anguilla"], "abalone": ["Haliotis", "Haliotidae"], "rosewood": ["Dalbergia", "Fabaceae"],
    "agarwood": ["Aquilaria", "Thymelaeaceae"], "pythons_reptiles": ["Python", "Pythonidae"], "orchids": ["Orchidaceae", "Dendrobium"],
    "cacti_succulents": ["Cactaceae", "Opuntia"], "cycads": ["Cycas", "Cycadales"], "carnivorous_plants": ["Nepenthes", "Dionaea", "Sarracenia"],
    "medicinal_plants": ["Panax", "Araliaceae"], "sandalwood": ["Santalum", "Santalaceae"], "resins_gums": ["Boswellia", "Burseraceae"],
    "bulbs_ornamental": ["Galanthus", "Amaryllidaceae"],
}


def get(path: str, **params):
    for _ in range(3):
        r = requests.get(API + path, params=params, headers=UA, timeout=40)
        if r.status_code == 200:
            return r.json()
        time.sleep(2)
    return None


def image_for(name: str, build: int):
    hit = get("/nodes", build=build, filter_name=name.lower(), page=0)
    items = (hit or {}).get("_links", {}).get("items", [])
    if not items:
        return None
    uuid = items[0]["href"].split("/nodes/")[1].split("?")[0]
    # Images of this taxon and its descendants; take the first openly licensed one.
    imgs = get("/images", build=build, filter_clade=uuid, embed_items="true", page=0)
    for im in (imgs or {}).get("_embedded", {}).get("items", []):
        links = im.get("_links", {})
        lic = links.get("license", {}).get("href", "")
        vec = links.get("vectorFile", {}).get("href")
        if vec and OPEN.search(lic):
            return {"taxon": name, "svg": vec, "license": lic, "attribution": im.get("attribution") or "",
                    "page": "https://www.phylopic.org/images/" + links["self"]["href"].split("/images/")[1].split("?")[0]}
    return None


def main() -> None:
    build = get("/")["build"]
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for gid, names in TAXA.items():
        found = next((m for n in names if (m := image_for(n, build))), None)
        if not found:
            print(f"  {gid}: no open silhouette")
            continue
        svg = requests.get(found["svg"], headers=UA, timeout=40).text
        svg = re.sub(r"<\?xml[^>]*>|<!DOCTYPE[^>]*>", "", svg).strip()
        (OUT / f"{gid}.svg").write_text(svg, encoding="utf-8")
        meta[gid] = {k: found[k] for k in ("taxon", "license", "attribution", "page")}
        print(f"  {gid}: {found['taxon']} ({found['attribution'] or 'no credit given'}; {found['license'].split('/licenses/')[-1] if '/licenses/' in found['license'] else found['license']})")
        time.sleep(0.4)
    (WEB / "data" / "species_icons.json").write_text(json.dumps(meta, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(meta)} of {len(TAXA)} groups have a silhouette")


if __name__ == "__main__":
    main()
