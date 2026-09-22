# The observatory network

VanNetra is one observatory among many. This document explains what the others
do, how each one feeds VanNetra's pipeline and design, and which principles the
project takes from them. The machine-readable registry is
[`pipeline/vannetra/resources/observatories.yaml`](../pipeline/vannetra/resources/observatories.yaml).
The site's **Network** section renders it.

## Where the list came from, and how it was checked

The registry combines three inputs:

1. the project owner's spreadsheet `illegal_wildlife_trade_observatories_comprehensive_2026.xlsx` (15 rows),
2. notes from a Google Gemini conversation (September 2026),
3. VanNetra's own collector registry (`sources.yaml`).

Inputs 1 and 2 were produced by a language model, so on 2026-09-22 every entry
was re-checked. The HTTP status was tested, and the page was read to see whether
it does what the entry claims. Corrections are stored in each entry's `status.note`
and shown on its card:

| Entry | What the input said | What we found |
|---|---|---|
| TRAFFIC Wildlife Trade Portal | link to a 2020 TRAFFIC Bulletin PDF | portal is `wildlifetradeportal.org` |
| SHERLOC | `illegalwildlifetradeprojects.org` | that is the World Bank GWP map; SHERLOC is `sherloc.unodc.org` |
| ECO-SOLVE | `/initiatives/eco-solve/` | 404; correct path `/initiatives/ecosolve/` |
| Wildlife Witness | active | Taronga says the app is offline; old URL 404 |
| WCS global monitor | "fully active", secure uploads | the page calls itself a demonstration base; e-mail submission |
| #WildEye | maps "all of Europe and Asia" | main map is Europe; separate regional maps |
| TimberStats, WILDTRADE | own domains | domains did not resolve; used TRAFFIC's launch page / CORDIS |
| Wildlife Sentinel | aviation reporting app | no official page found: kept as **unverified** |
| Codewords ("striped T-shirt", "four-wheeler", "teh", "penny" …) | "verified public list" | no primary source found: **watchlist only** |

## How each kind of observatory feeds VanNetra

| Stage | What happens | Observatories that inform it |
|---|---|---|
| **Collect** | news, official feeds, online listings, bulk trade data | GDELT, Google News (opt-in), YouTube (opt-in), CITES Trade DB, Indian Kanoon (planned) |
| **Screen** | is this an IWT signal? | WCS-OWT labels (training), PMC8579131 names, ECO-SOLVE / WILDTRADE methods, Coalition policy on codewords |
| **Extract** | species, place, route, quantity, mode, agency | GeoNames, C4ADS & ROUTES transport framing, Species+ (planned), EIA convictions |
| **Link** | cases → entities → networks | WJC / Oxpeckers / Operation Jaguar as seed networks; TRAFFIC portal & ETIS as benchmarks |
| **Publish** | privacy gate, static site | SMART's open-code / closed-data split |
| **Design** | how people move through it | WCS Brasil dashboard (structure), #WildEye (case lifecycle), TradeMapper (bring your own data), OpenHiggsfield (motion) |
| **Governance** | what not to publish, where to report | Coalition to End Wildlife Trafficking Online, WildScan, ENV hotline, WCCB |

## Principles taken from the network

1. **Open code, closed operations** (SMART, NGO data sharing). Software, methods and aggregates are public. Names, informants and patrol data are not.
2. **A machine ranks, a person decides** (ECO-SOLVE hubs, WILDTRADE). Classifier plus review queue plus relabel loop.
3. **Follow the logistics** (C4ADS, ROUTES). Every case records transport mode and route.
4. **Follow the case to court** (#WildEye, SHERLOC). A case's kind moves from seizure to arrest to conviction.
5. **Bridge source and demand** (PMC8579131, EIA, Operation Jaguar). Map local names to taxa and taxa to end uses, so source-country listings and demand-country seizures meet in one chart.
6. **Verify before you trust.** LLM-supplied claims are checked, corrections are shown, and unverified terms never drive automation.

## Adding an observatory

Add an entry to `observatories.yaml` with `status.state` and `status.checked`,
plus a `vannetra.how` that says concretely which stage it serves. An entry that
cannot say how it helps goes in with `role: []` so the gap stays visible.
