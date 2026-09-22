# Changelog

All notable changes to WildTrace. Dates are the release date, newest first.

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
