# Changelog

All notable changes to WildTrace. Dates are the release date, newest first.

## 1.5.0 — 2026-09-23

### Added
- **Cases · Flows · Zoonoses.** The Atlas now answers three questions on the same map, switched
  from the top bar. Each mode brings its own left panel, and Flows and Zoonoses switch to the flat
  map so both ends of a route are in view.
- **Flows: supply, transit and demand.** 15,512 seized shipments reported to CITES since 2015
  (source code I, CITES Trade Database 2026.1), drawn from where a specimen was taken to where it
  was seized. The reader builds the view: follow a species or a country, pick source and market
  countries, the number of routes and the evidence (seized, declared legal trade, routes named in
  cases), and colour lines by region (eight UN M49 regions, colour-blind-safe palette), role
  (source, transit hub, market) or species. Lines shade from the source region's colour to the
  market's, arrowheads and moving dashes show direction, and a glow under each market grows with
  what arrives. Every route is a checkbox; a story sentence is written from what is on; the whole
  view is kept in the link.
- **Who supplies whom**: a source × market heatmap by country or region, plants, animals or both,
  with or without the United States. Clicking a cell draws that route.
- **Zoonoses**: 2,116 WHO Disease Outbreak News reports of diseases with an animal reservoir,
  grouped by how they reach people (wildlife contact, birds, livestock, insects and ticks), with
  WildTrace cases overlaid; a "countries with both" list; and a table of the viruses confirmed by
  sequencing or isolation in each traded species group (VIRION), same species as in people and
  close relatives, by virus family. Literature notes found with Consensus (Gippet et al. 2026,
  Shivaprakash et al. 2021, Lee et al. 2020, Gibb et al. 2024).
- **Analysis sheet**: cases per month, events, species, source or market, transport and CITES
  seizures per year, each with what it can and cannot show.
- Species records show a Sankey of seized shipments (taken from, shipped from, seized in) and the
  species' viruses; country records show a source / transit / market bar and outbreak counts.
- Species pages for groups the news rarely covers (orchids, cacti, cycads and others) now exist,
  built from their CITES seizure records.
- `wildtrace cites` now covers every country (it was limited to South and Southeast Asia) and
  `wildtrace zoonoses` refreshes VIRION and WHO data weekly in CI.

## 1.4.0 — 2026-09-23

### Added
- **A crawlable layer.** A static page for every case, species group and country, an index at
  `/browse.html`, `sitemap.xml`, a `robots.txt` that names the AI crawlers explicitly, and
  `llms.txt`. Schema.org Dataset, WebSite and FAQPage structured data on the Atlas; Dataset and
  Report structured data on the static pages. Every page carries the reporting caveat with its
  numbers, so a quoted figure arrives with its limits.
- **Literature miner** (`wildtrace mine`): Europe PMC and OpenAlex searches for trade research,
  with species names resolved against the GBIF backbone, candidate trade names and code words
  taken only from sentences that say a name is used in trade, and dataset links. Output is CSV
  for review; nothing merges itself into the lexicon.
- **Eight flora groups**: orchids, cacti and succulents, cycads, carnivorous plants, medicinal and
  aromatic plants, sandalwood, resins and gums, wild bulbs and ornamentals. 39 groups in all.

### Changed
- Phones: the lens bar scrolls with a fade instead of clipping Tour and Investigate, and the
  trivia box appears folded above the summary panel instead of being hidden.

## 1.3.0 — 2026-09-23

### Added
- **Guided walkthrough.** Nine steps that spotlight the live interface, run once for a new
  reader and replayable from the Tour button. Keyboard-driven and escapable at any step.
- **"Why this matters" trivia box.** Collapsible, one card at a time, with a diagram drawn to
  the figure it illustrates. Report figures carry their source, year and a link; cards counted
  from WildTrace's own data are generated at build time and labelled as such, with their bias
  stated. A test checks the derived numbers against the published cases.
- **A written account on every case.** What was reported, where, how much, who acted and how
  well it is evidenced, in prose, above the documented facts, analytical context and limits.
  The documented facts are now a scannable strip, and repeated quantity readings are shown once.
- **Microsoft Clarity** usage analytics, with text masking, Global Privacy Control honoured, and
  the project id in one HTML attribute so a fork can remove it. Documented in About,
  ETHICS_PRIVACY and SECURITY.

### Changed
- The link chart opens on the best-connected core rather than the whole network.
- The walkthrough and trivia box follow the OpenHiggsfield motion vocabulary already in the CSS:
  cards arrive on `--ease`, the overlay leaves faster than it enters on `--ease-exit`, and the
  spotlight travels on `--ease-slide`.

### Fixed
- The tour spotlight never highlighted anything, because `offsetParent` is null for every
  fixed-position panel.

## 1.2.1 — 2026-09-22

First release archived on Zenodo ([10.5281/zenodo.22902819](https://doi.org/10.5281/zenodo.22902819)).

### Added
- **Evidence grading.** Each case is validated, official, corroborated or single report, shown on
  the map, in the case panel, in the table and in the CSV. Reviewers record checks in
  `validations.yaml`; rejected cases are dropped at the next build.
- **Official sources.** A collector for 25 government, enforcement and judicial domains, searched
  in their own language, plus source tiering by domain.
- **History backfill.** Month-by-month collection (`--history N`), so the timeline shows real
  history instead of a single recent spike.
- **Open data.** `cases.csv` per-case export, CC BY 4.0, with a citation line and DOI.
- **Table** and **About** panels; focus moves into a case when it opens.
- **Report a correction** on every case, opening a pre-filled issue.
- Social preview image, redrawn from the live site by `scripts/make_og.py` on every weekly
  refresh so its counts stay current; self-hosted fonts; `CITATION.cff` and `.zenodo.json`.

### Changed
- The map shows a density glow, pales single-report cases, rings approximate places, scales
  clusters with zoom, and hides the Routes toggle until a report states a route.
- Investigate opens on the best-connected part of the network instead of the whole graph, and
  loads its libraries only when opened.
- Renamed throughout to the **OWT labelled set**.

### Data
1,251 cases, 59 countries, 1,752 public reports, 2024-01-15 to 2026-09-22.
187 official, 140 corroborated, 924 single report. 559 mapped, 135 country-only, 557 unmapped.

## 1.1.0 — 2026-09-22

Rebranded to WildTrace: one global map, no page tabs, light glass design, 33-entry observatory
network, in-browser link-analysis workbench.
