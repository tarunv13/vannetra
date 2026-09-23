# Changelog

All notable changes to WildTrace. Dates are the release date, newest first.

## Unreleased

### Added
- **A 2-minute video guide** (Tour menu, the welcome card, About, or `#guide` in the address).
  It is a real recording of the live Atlas, not generated footage, and it answers three research
  questions: where the pangolin evidence in India comes from, where seized red sanders goes, and
  where animal-borne outbreaks and trafficking overlap. It also shows Investigate, Analysis and the
  tours. Captions are burned into the picture and also provided as a text track. To regenerate it,
  run `scripts/make_guide.py`, which writes `web/media/guide.mp4`, `.jpg` and `.vtt`.

## 1.6.1 — 2026-09-23

### Added
- **Satellite view.** A map button switches to EOxCloudless 2024 imagery (Copernicus Sentinel-2,
  CC BY-NC-SA 4.0, credited on the map), so forests, deserts, mountains and coasts can be read.
  Place names turn white on a dark halo over imagery. The choice is remembered; nothing loads from
  EOX unless it is switched on.

### Changed
- **Flows spreads routes across markets by default**: the busiest routes, but at most two into any
  one country. The default view went from 12 of 14 routes ending in the United States (an artefact of
  how completely it reports seizures) to routes into ten markets across Asia, the Gulf, Europe and
  North America. Switch it off for the raw ranking; it is kept in the link.
- The rotate button and the idle spin are gone: the spin stopped at the first touch and did nothing
  outside Cases, so the button looked broken.
- Deeper water on the map, so land and sea separate at a glance.
- The two routes named in news reports are no longer drawn on the opening map, where "Routes 2"
  suggested wildlife moves along two routes. The legend now links to Flows (15,000+ seized
  shipments reported to CITES); the news routes remain an evidence layer there.

## 1.6.0 — 2026-09-23

### Added
- **Evidence behind every route.** Each Flows route has an Evidence button, and clicking a line on
  the map opens the same page: what was seized (species and products such as ivory carvings, skins,
  timber or live animals), the years, which country reported it, the declared purpose, any transit
  countries, a plain answer to "where is the article?" (CITES records are government reports, not
  news, and are anonymised shipment by shipment) with a link to check the CITES Trade Database, and
  the WildTrace news cases involving the same species in those countries, with their outlets.
- **Icons and logos throughout.** Species silhouettes from PhyloPic (public domain, CC0 or CC BY,
  credited on each species page) for 37 of 38 groups; product and case-kind icons from Tabler Icons
  (MIT); case kinds as glyphs inside the map points; outlet logos beside every source (570 outlets)
  and organisation logos on the Network cards. Logos are fetched once at build time and served from
  the site, so a reader's browser never contacts a third party for them.
- `web/data/flows_detail.json`: per-route taxa, products, years, reporters, purposes and transit.
- **Country flags** wherever a country is named: country pages, case chips, Pulse, search, Flows
  routes and pickers, the route evidence page, the heatmap, the Zoonoses and Analysis lists
  (flag-icons, MIT, self-hosted).
- **Tours for every section.** The main tour now covers the three modes and every menu, with a
  full Investigate step and buttons that jump straight into the Flows or Investigate tours. Flows,
  Zoonoses, Investigate, its import tab, Analysis, the heatmap, Network, Table and Methods each have
  a short tour that runs the first time they open. Every card has a "Don't show section tips"
  switch, and the Tour button opens a menu: full tour, tour this section, tips on or off, reset.
- Pulse links straight into Investigate.

### Changed
- The timeline is drawn at the dock's real size (it was stretched), with years marking January and
  month labels thinned on narrow screens; it redraws when the dock resizes.
- The map-layer switches (cases, routes, observatories, your data) moved from the top bar into the
  legend beside the map, so the top bar fits every desktop width and Investigate is never cut off.

## 1.5.1 — 2026-09-23

### Changed
- **Daily refresh.** The update workflow now runs every day at 03:17 UTC: Google News for the last
  three days, WHO outbreak reports and VIRION every day; government and court domains and GDELT on
  Mondays. The collected records live in a private archive repository that the workflow restores
  and extends, so every build sees the full history. The site is redeployed only when the data
  changed.
- **Shrink guard.** A build that would publish more than 10% fewer cases than are live stops instead.

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
