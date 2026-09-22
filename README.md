# VanNetra · वन नेत्र

**An open-source OSINT observatory and link-analysis workbench for illegal wildlife trade in India and Southeast Asia.**

VanNetra ("eye of the forest") collects open reports of wildlife seizures, arrests and convictions and extracts structured cases from them. It maps the cases and charts the network behind them: species, places, routes, agencies and transport modes. It also brings a trained classifier for spotting online trade listings, built on WCS India's labelled Online Wildlife Trade (OWT) data.

It has four parts. Each one works without the others:

| Part | What it is | Where |
|---|---|---|
| **Pipeline** | Python: collect → screen → extract → merge → link → publish | `pipeline/vannetra/` |
| **Classifier** | Relevance model for online trade listings (R/IR), with honest evaluation and a relabel loop | `pipeline/vannetra/classify/` |
| **Website + WebGIS** | Static site: map, cases, species, trade routes, methods | `web/` |
| **Workbench** | In-browser link-analysis chart, an open alternative to i2 Analyst's Notebook | `web/js/workbench.js` |
| **Network** | Registry of 33 observatories, databases, codebooks and reporting apps: each one's function, live status and role in VanNetra | `resources/observatories.yaml`, [`docs/OBSERVATORIES.md`](docs/OBSERVATORIES.md) |

There is no server, database, account or tracking. The site is static files, so it runs on GitHub Pages, any web host, or a laptop with no internet beyond the map tiles.

---

## Quick start

```bash
git clone <this repo> vannetra && cd vannetra
pip install -e ".[dev]"            # add [embed,video] for sentence-transformers / yt-dlp

# 1. Train the listing classifier on your WCS-OWT CSVs (kept private, never committed)
export VANNETRA_WCS_OWT_DIR="/path/to/WCS-OWT"      # PowerShell: $env:VANNETRA_WCS_OWT_DIR="..."
python -m vannetra.cli train --target-recall 0.98

# 2. Collect open news and build the site data
python -m vannetra.cli run --countries IN,NP,BD,MM,TH,VN,MY,ID,PH

# 3. View the site
python -m http.server -d web 8000     # open http://localhost:8000
```

Google News (`--gnews`) and YouTube (`--youtube`) are switched on for this project. The first full run (22 Sep 2026) produced 331 news articles and 786 YouTube listings, plus GDELT, which is throttled and stops itself after two refusals. That became **72 cases**. The largest is the Balasore orangutan rescue, merged from 31 reports.

Other commands: `codebook <zip>` merges the PMC8579131 multilingual names (45k names, CC BY; download the zip from figshare in a browser), `gazetteer` rebuilds the GeoNames place index, `doctor` lists the available tools and sources, `relabel` merges reviewed labels, and `cites <folder>` loads the CITES Trade Database.

## Pipeline

```
collect ──► screen ──► extract ──► merge ──► link ──► publish
GDELT        species    place, route,  1 case per   entity–link   privacy gate
feeds        lexicon ×  quantity, ₹,   incident     graph +       → web/data/*.json
YouTube*     enforce-   agency, mode,  (species,    centrality,   + GraphML / CSV
Agent Reach* ment cues  arrests,       region,      communities   for i2 / Gephi
CITES bulk              evidence text  ±4 days)
```
\* opt-in.

- **Sources** are listed in [`resources/sources.yaml`](pipeline/vannetra/resources/sources.yaml), with access method, terms and on/off state. GDELT is on by default. Google News RSS and YouTube are opt-in because of their terms. Court records (Indian Kanoon) and the TRAFFIC, EIA and WJC reports are registered as manual or request-only sources.
- **The lexicon** ([`resources/lexicon.yaml`](pipeline/vannetra/resources/lexicon.yaml)) covers 21 species groups in English, Hindi (Devanagari and Latin script), Telugu, Vietnamese, Indonesian/Malay and Thai. It includes the WCS-OWT seller phrases such as *asli kasturi ki kimat*, *hatha jodi*, *do muha saap* and *vajrakit*.
- **The gazetteer** geocodes offline. A hand-curated file ([`gazetteer.csv`](pipeline/vannetra/resources/gazetteer.csv): states, border towns such as Moreh and Champhai, SE Asian ports) takes priority over a GeoNames extract (`gazetteer_geonames.csv`, about 21,700 places: towns over 1,000 people in 18 countries, plus every Indian district and sub-district seat). Rebuild the extract with `vannetra gazetteer`.
- **Article ledes.** GDELT returns headlines only, so `build` fetches the opening paragraphs of each enforcement candidate. It respects robots.txt and caches the pages, and stores the text in `data/interim`, which is never published. Pass `--no-fetch` to skip this step.
- **Agent Reach** ([Panniantong/agent-reach](https://github.com/Panniantong/agent-reach)) is used the way it is designed to be used. `vannetra doctor` asks it which upstream tools are healthy, and the collectors then call those tools (for example yt-dlp) directly.

## Classifier: what "98%" means here

The target is to keep **at least 98% of true trade listings** (recall on R). Among the models that meet it, the one that wrongly flags the fewest irrelevant items wins.

The protocol, in `classify/train.py`:
1. A 20% test split is locked away first. It is split **by channel**, so a seller's videos never appear on both sides. Without this, near-duplicate titles inflate every score.
2. Candidate models are compared with repeated StratifiedGroupKFold cross-validation: word TF-IDF, character n-grams, union + cue features, SVM, Naive Bayes, multilingual sentence embeddings, and an ensemble.
3. The decision threshold is set on out-of-fold probabilities to reach the recall target.
4. The winner is scored **once** on the locked test set. That is the number reported.

Current result (1,274 videos, 927 R / 347 IR; 29 with conflicting labels held out):

| | 2022 notebook | VanNetra v0.1 (locked test) |
|---|---|---|
| R recall | 0.97 | **0.97** (0.98 in CV) |
| IR correctly rejected | 0.43 | **0.53** |
| ROC-AUC | – | 0.95 |
| Protocol | one random split, title only | channel-grouped, title + description |

Multilingual MiniLM embeddings scored *worse* (0.41 IR rejected), because seller jargon is lexical. The learning curve has plateaued. The labels, not the model, now set the ceiling: the review queue shows the same phrasing labelled both ways. [`data/labels/README.md`](data/labels/README.md) is the codebook and the relabel loop:

```bash
python -m vannetra.cli train      # writes data/labels/review_queue.csv
# fill new_label = R / IR for rows you have checked
python -m vannetra.cli relabel    # → corrections.csv
python -m vannetra.cli train      # compare models/relevance_report.json
```

## Workbench (open i2 Analyst's Notebook alternative)

- **Entities**: Case, Species, Location, Agency, Commodity, Mode, Outlet. Colour, shape and label encode type, so type is never shown by colour alone. Person, Phone, Account and Vehicle entities exist only for **your local data**.
- **Analysis**: search, expand, isolate, hide, shortest path (A*), node size by degree or betweenness (brokerage), Louvain communities, and a time filter.
- **Layouts**: force-directed, concentric by centrality, tree, circle.
- **Import**: CSV with one row per link (`source,source_type,target,target_type,link_type,date`, the same shape as an i2 ANB import specification), or JSON.
- **Export**: PNG, GraphML (Gephi/yEd), CSV (i2 ANB/Maltego), Cytoscape JSON.
- **Privacy**: imported data is stored in your browser's localStorage and never leaves the device.

## Motion and interaction

The site's motion system (`web/css/motion.css`, `web/js/motion.js`) is adapted from the OpenHiggsfield studio's motion vocabulary: two easing curves, entrances that bloom, exits faster than entrances, one white plate that glides between tabs, seamless loading sheens, and numbers that count rather than redraw. Sections change through the View Transitions API. **Glide through cases** flies the map through the period's cases in order, with a glass caption and a draining progress line. Picking a case in the list flies the map to it before the report opens. Everything is off under `prefers-reduced-motion`.

## Privacy and ethics

See [`docs/ETHICS_PRIVACY.md`](docs/ETHICS_PRIVACY.md). In short:
- The published site **never names a person**. Case summaries are generated from extracted facts, not copied headlines. Arrests are counts.
- Phones, e-mails, messenger links and handles are scrubbed, and `publish` **fails** if any remain (`privacy.assert_public_safe`, also checked in CI).
- Seller channel names are used only as a cross-validation grouping key. They are never a feature and never published.
- There are no analytics or cookies. robots.txt and rate limits are respected.

## Extending to a new country

1. Add place rows to `gazetteer.csv` and local-language terms to `lexicon.yaml`.
2. Add the country's official feeds to `sources.yaml` (`access: rss`).
3. Add its code to `--countries`. Tests check that the lexicon still parses and matches.

## Repository layout

```
pipeline/vannetra/   collect/ classify/ extract/ graph/ resources/ publish.py cli.py privacy.py
web/                 index.html css/glass.css js/{app,map,charts,workbench}.js data/ (generated, public)
data/                raw/ private/ interim/ labels/   (gitignored except labels/README.md)
models/              relevance.joblib, relevance_report.json (gitignored)
docs/                ARCHITECTURE.md, ETHICS_PRIVACY.md
.github/workflows/   ci.yml (tests + privacy gate), update.yml (weekly refresh → Pages)
```

## Credits and licence

Code: MIT. Case data is derived from public reports, with links to each original. Training data: WCS India Online Wildlife Trade labelled set (private; aggregates only). News index: [GDELT Project](https://www.gdeltproject.org/). Legal trade: CITES Trade Database (UNEP-WCMC). Places: [GeoNames](https://www.geonames.org/) (CC-BY 4.0). Basemap: [OpenFreeMap](https://openfreemap.org/) / OpenStreetMap contributors. Inspired by WCS Brasil's Global Wildlife Trafficking Observatory and i2 Analyst's Notebook.
