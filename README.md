# WildTrace

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22902819.svg)](https://doi.org/10.5281/zenodo.22902819)

**The open atlas of illegal wildlife trade.** WildTrace is an open-source map of the global illegal wildlife trade: seizures, arrests and convictions, the routes between them, the species and the names they are sold under, and the observatories that watch them. It includes an in-browser link-analysis workbench (an open alternative to i2 Analyst's Notebook) that works on your own data without uploading it.

*Wild* covers everything CITES calls "wild fauna and flora": ivory and orchids, pangolins and rosewood. *Trace* is what investigators do and what the trade leaves behind. The map at its centre is **the Atlas**. Tagline: **Follow the trade.**

**Live:** https://tarunv13.github.io/wildtrace/

---

## One map, no pages

Everything happens on a single globe. The other surfaces float over it, so you can wander back and forth without losing your place:

| Surface | What it does |
|---|---|
| **Globe** | Cases (colour = seizure / arrest / rescue; paler = single report; a ring = approximate place), a density glow, reported routes as arcs once a report states one, and observatories. Globe/flat toggle, slow rotation (stops when you touch it), legend toggle |
| **Search** (`/`) | One box for cases, species, countries and observatories, with keyboard navigation |
| **Pulse** | A live summary of what is in view. Every bar is a filter (species, country, kind) |
| **Inspector** | Case, species, country, observatory or your own entity. Everything links onward, with back/forward and a breadcrumb trail. The URL follows, so any view can be shared |
| **Timeline** | Cases per week. Drag to pick a period; ▶ glides the map through cases in time order |
| **Investigate** | Link chart (i2-style) of cases, species, places and agencies, plus **Your data**: import CSV, Excel or JSON, map columns, and see it on the chart and the globe, all in your browser |
| **Network** | 33 observatories, databases and codebooks, each checked, with what it does and how WildTrace uses it |
| **Table** | Every case in a sortable, filterable, keyboard-friendly table, with CSV download |
| **About** | What the evidence labels mean, coverage, who runs it, licence, how to cite, how to report a correction |
| **Methods** | Pipeline, classifier, privacy and sources |

Case records follow evidence discipline: **documented facts**, **analytical context** and **limits of the evidence** are kept apart. Routes are attributed to the reports ("as reported"), and every case links to its original sources.

## How much to trust a case

Every case carries one verification status, shown on the map, in the case panel and in the CSV:

| Status | Meaning |
|---|---|
| **Validated** | A person checked it against its sources (recorded in [`validations.yaml`](pipeline/wildtrace/resources/validations.yaml), with reviewer, date and note) |
| **Official** | At least one report is a government, customs, police, prosecutor or court release (tiered by domain in `sources_tier.py`) |
| **Corroborated** | Two or more independent outlets report it |
| **Single report** | One outlet only: a lead, not a finding |

Anyone can challenge a case: every case panel has **Report a correction**, which opens a pre-filled GitHub issue. Reviewers mark a case `validated` or `rejected` in `validations.yaml`; rejected cases are dropped at the next build.

The map shows where wildlife crime is *reported* in the newsrooms and government sites searched, not where it happens. Cases whose reports name no place are counted but not drawn, and the Pulse says how many are pinned.

## Data, licence and citation

- **Download:** [`web/data/cases.csv`](https://tarunv13.github.io/wildtrace/data/cases.csv) (one row per case, with status, place, species and source links) and the JSON behind the map in `web/data/`.
- **Licence:** data CC BY 4.0, code MIT.
- **Cite:** Verma, T. (2026). *WildTrace: the open atlas of illegal wildlife trade.* Zenodo. https://doi.org/10.5281/zenodo.22902819. That DOI always points to the latest version; cite [10.5281/zenodo.22902820](https://doi.org/10.5281/zenodo.22902820) for v1.2.1 exactly. GitHub's "Cite this repository" button reads [`CITATION.cff`](CITATION.cff).

## Coverage

- **30 species groups**, from pangolin, ivory, rhino horn, tiger and leopard to jaguar, lion bone, African grey parrots, totoaba, glass eels, abalone, rosewood and agarwood. Terms come in English, Hindi, Telugu, Portuguese, Spanish, French, Vietnamese, Thai and Indonesian/Malay, plus 2,376 names in 66 languages from the open seized-wildlife codebook (Stringham et al. 2021, PMC8579131).
- **46,000 places**: every town above 15,000 people worldwide, every town above 1,000 in South and Southeast Asia, every Indian district, the key trafficking airports, and Hindi and native-script names (GeoNames, CC BY).
- **Official sources first:** releases from 25 government, enforcement and judicial domains worldwide (gov.br, gob.mx, go.id, gov.in, nic.in, gov.za, go.ke, justice.gov, fws.gov, gov.uk, gouv.fr, INTERPOL, the EU and more), searched in their own language.
- **News in 23 Google News editions** (Asia, Africa, Latin America, demand markets), with a month-by-month history backfill, plus GDELT and YouTube listings collected locally.
- The [observatory network](docs/OBSERVATORIES.md) lists the validated datasets behind the field (the CITES Trade Database, LEMIS, ETIS, UNODC World WISE and SHERLOC, the TRAFFIC Wildlife Trade Portal, C4ADS, WCS Brasil's observatory and others), with their access terms. WildTrace links to them rather than republishing what their licences restrict.

## Run it

```bash
pip install -e ".[dev,video]"
export WILDTRACE_WCS_OWT_DIR=/path/to/WCS-OWT          # optional: trains the listing classifier
wildtrace train                                          # classifier, channel-grouped evaluation
wildtrace collect --official --gnews --countries ALL   # official releases + global news
wildtrace collect --history 12 --no-gdelt               # one-off: backfill 12 months
wildtrace build                                          # cases, graph, CSV, site data (privacy gate)
python -m http.server -d web 8000                      # open http://localhost:8000
```

Other commands: `gazetteer` rebuilds the place index, `codebook <zip>` merges the PMC8579131 names, `cites <folder>` loads the CITES Trade Database, `relabel` merges classifier corrections, and `doctor` checks tools and sources.

## How a report becomes a case

```
collect ─► screen ─► extract ─► merge ─► link ─► publish
news,       species ×   species, place,   one case per      entity–link     privacy gate,
listings,   enforcement route, quantity,  incident, across  graph with      static JSON
bulk data   cues, minus arrests (count),  languages and     centrality      for the map
            false cues  agency, mode      story days
```

- **Screening** rejects look-alikes (an ivory-smuggling *film*, "Kasturi" liquor, the Ivory Park township).
- **Places** come from the report: Hindi words such as कुशीनगर are transliterated and matched by consonant skeleton, and homonyms are resolved by the country the text names. Google News links are not decoded, because its robots.txt forbids it.
- **Merging** keeps one incident as one case, even when Hindi and English reports share no words. A shared arrest count and date is enough.

## The classifier

Trained on the OWT labelled set (1,274 labelled online listings, loaded by `classify/dataset.py`), evaluated on a test set split by seller channel. At the target of keeping 98% of trade listings it rejects about half of the irrelevant ones. Contradictory labels, not the model, set the ceiling. [`data/labels/README.md`](data/labels/README.md) has the codebook and the relabel loop.

## Privacy

WildTrace never publishes a person's name, a phone number, an e-mail address or a seller identity; the build fails if one slips through, and CI checks again. Your imported data lives in your browser's localStorage. There are no analytics, cookies or accounts, and fonts are self-hosted, so opening the site contacts no font service. The link-chart and Excel libraries load only when you open Investigate. See [`docs/ETHICS_PRIVACY.md`](docs/ETHICS_PRIVACY.md).

## Repository

```
pipeline/wildtrace/  collectors, classifier, extraction, graph, publishing (Python package; CLI: wildtrace)
web/                the portal: index.html, css/wildtrace.css, js/{main,globe,inspector,pulse,timeline,search,investigate,sheets,store}.js
docs/               ARCHITECTURE, ETHICS_PRIVACY, OBSERVATORIES
.github/workflows/  tests + privacy gate; weekly refresh; Pages deploy
```

## Credits

Code MIT; data CC BY 4.0. Places: GeoNames (CC BY 4.0). Names codebook: Stringham et al. 2021 (CC BY 4.0). News index: GDELT. Basemap: OpenFreeMap / OpenStreetMap contributors. Motion vocabulary adapted from OpenHiggsfield. Inspired by WCS Brasil's Global Wildlife Trafficking Observatory, C4ADS, TRAFFIC, #WildEye and i2 Analyst's Notebook.
