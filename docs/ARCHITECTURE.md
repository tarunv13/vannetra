# Architecture

## Design choices

| Choice | Why |
|---|---|
| Static site, no backend | Free to host (GitHub Pages), nothing to breach, easy for NGOs and universities to fork and move. |
| Hash router + ES modules, no build step | Anyone who can edit HTML can change it. There is no Node toolchain to rot. |
| MapLibre GL 5 + OpenFreeMap Positron | Open-source WebGL maps with a light basemap and no API key. |
| Cytoscape.js | Mature graph engine: layouts, A*, selectors, PNG export. Runs the Workbench fully client-side, and loads only when Investigate opens (as does SheetJS). |
| Self-hosted fonts | No request to a font service when someone opens the site. |
| Rule-based extraction with evidence strings | Each field can be traced to a phrase in the source, which is what a case report must be able to show. The ML goes where it pays off, in screening noisy listings. |
| TF-IDF + logistic regression as the default model | Beat multilingual embeddings on this data, trains in seconds on a laptop, and its coefficients can be read. |
| YAML lexicon, CSV gazetteer, YAML source registry | Domain experts can extend coverage without touching code. |

## Data contracts

`schema.Record` (collector output, `data/raw/*.jsonl`, private):
`url, title, text, source, outlet, published, lang, country_hint, kind, query, extra`

`extract.events.Event` (`data/interim/events.jsonl`, private): adds species, terms, place, places, countries,
route, agencies, modes, quantities, value_inr, people_arrested, evidence, trade_signal.

Public case (`web/data/cases.json`): `id, date, kind, event_types, summary, species, place{name,type,country,admin1,lat,lon},
places, countries, route, agencies, modes, quantity, value_inr, people_arrested, sources[{outlet,url,date,domain,tier}], n_sources,
n_outlets, verification, review, confidence`. The same cases, flattened, go to `web/data/cases.csv`.

Verification (`extract/cases.py`, then `publish.py`): `official` if any source's domain is a government, enforcement or
judicial publisher (`sources_tier.py`), else `corroborated` if two or more distinct outlets report it, else `single`.
`resources/validations.yaml` overrides this by case ID: `validated` (a reviewer checked it) or `rejected` (dropped).
Cases dated before `publish.MIN_DATE` and pages from research or policy portals (`publish.NOT_EVENTS`) are left out.

Graph (`web/data/graph.json`): Cytoscape elements. Nodes carry `type, label, degree, betweenness, community` plus
type-specific fields. Edges carry `type, weight, first, last`.

Link types: `involves` (Case→Species), `occurred_at` (Case→Location), `within` (Location→Location),
`trafficked_to` (Location→Location), `acted_in` (Agency→Case), `via` (Case→Mode), `reported` (Outlet→Case),
`seized` (Case→Commodity).

## Adding a collector

1. Write `collect/<name>.py` that returns `list[Record]`, using `collect.base.get` (polite HTTP).
2. Register the source in `resources/sources.yaml` with `access`, `terms` and `enabled`.
3. Call it from `cli._collect` behind a flag if its terms need opt-in.

## Adding a training task (e.g. news relevance)

`classify/train.py` works for any frame with `text`, `y` and `cv_group` columns. Write a loader like
`classify/dataset.py` for the new labels, then call `train()` with it. Keep the grouped test split, and keep
grouping by publisher or seller.
