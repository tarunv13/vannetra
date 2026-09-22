# Pugmark

**Open intelligence on the wildlife trade.** Pugmark is an open-source map of the global illegal wildlife trade: seizures, arrests and convictions, the routes between them, the species and the names they are sold under, and the observatories that watch them. It includes an in-browser link-analysis workbench (an open alternative to i2 Analyst's Notebook) that works on your own data without uploading it.

A *pugmark* is the footprint a tracker reads to follow an animal. Here, the trail is evidence.

**Live:** https://tarunv13.github.io/vannetra/

---

## One map, no pages

Everything happens on a single globe. The other surfaces float over it, so you can wander back and forth without losing your place:

| Surface | What it does |
|---|---|
| **Globe** | Cases (colour = seizure / arrest / rescue; a hollow marker means the place is only inferred from the publisher), reported routes as arcs, and observatories, with a globe/flat toggle |
| **Search** (`/`) | One box for cases, species, countries and observatories, with keyboard navigation |
| **Pulse** | A live summary of what is in view. Every bar is a filter (species, country, kind) |
| **Inspector** | Case, species, country, observatory or your own entity. Everything links onward, with back/forward and a breadcrumb trail. The URL follows, so any view can be shared |
| **Timeline** | Cases per week. Drag to pick a period; ▶ glides the map through cases in time order |
| **Investigate** | Link chart (i2-style) of cases, species, places and agencies, plus **Your data**: import CSV, Excel or JSON, map columns, and see it on the chart and the globe, all in your browser |
| **Network** | 33 observatories, databases and codebooks, each checked, with what it does and how Pugmark uses it |
| **Methods** | Pipeline, classifier, privacy and sources |

Case records follow evidence discipline: **documented facts**, **analytical context** and **limits of the evidence** are kept apart. Routes are attributed to the reports ("as reported"), and every case links to its original sources.

## Coverage

- **30 species groups**, from pangolin, ivory, rhino horn, tiger and leopard to jaguar, lion bone, African grey parrots, totoaba, glass eels, abalone, rosewood and agarwood. Terms come in English, Hindi, Telugu, Portuguese, Spanish, French, Vietnamese, Thai and Indonesian/Malay, plus 2,376 names in 66 languages from the open seized-wildlife codebook (Stringham et al. 2021, PMC8579131).
- **46,000 places**: every town above 15,000 people worldwide, every town above 1,000 in South and Southeast Asia, every Indian district, the key trafficking airports, and Hindi and native-script names (GeoNames, CC BY).
- **News in 23 Google News editions** (Asia, Africa, Latin America, demand markets) plus GDELT, and YouTube listings collected locally.

## Run it

```bash
pip install -e ".[dev,video]"
export VANNETRA_WCS_OWT_DIR=/path/to/WCS-OWT          # optional: trains the listing classifier
pugmark train                                          # classifier, channel-grouped evaluation
pugmark collect --gnews --youtube --countries ALL     # global news + listings
pugmark build                                          # cases, graph, site data (privacy gate)
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

Trained on WCS India's labelled online listings (1,274 videos), evaluated on a test set split by seller channel. At the target of keeping 98% of trade listings it rejects about half of the irrelevant ones. Contradictory labels, not the model, set the ceiling. [`data/labels/README.md`](data/labels/README.md) has the codebook and the relabel loop.

## Privacy

Pugmark never publishes a person's name, a phone number, an e-mail address or a seller identity; the build fails if one slips through, and CI checks again. Your imported data lives in your browser's localStorage. There are no analytics, cookies or accounts. See [`docs/ETHICS_PRIVACY.md`](docs/ETHICS_PRIVACY.md).

## Repository

```
pipeline/vannetra/  collectors, classifier, extraction, graph, publishing (Python package; CLI: pugmark)
web/                the portal: index.html, css/pugmark.css, js/{main,globe,inspector,pulse,timeline,search,investigate,sheets,store}.js
docs/               ARCHITECTURE, ETHICS_PRIVACY, OBSERVATORIES
.github/workflows/  tests + privacy gate; weekly refresh; Pages deploy
```

## Credits

Code MIT. Places: GeoNames (CC BY 4.0). Names codebook: Stringham et al. 2021 (CC BY 4.0). News index: GDELT. Basemap: OpenFreeMap / OpenStreetMap contributors. Motion vocabulary adapted from OpenHiggsfield. Inspired by WCS Brasil's Global Wildlife Trafficking Observatory, C4ADS, TRAFFIC, #WildEye and i2 Analyst's Notebook.
