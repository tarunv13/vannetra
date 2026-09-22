# Ethics, privacy and responsible OSINT

VanNetra publishes information about crimes. That creates duties towards the
people named in reports, towards the sources, and towards readers who may act on
the data.

## 1. People

| Risk | Control |
|---|---|
| Accused persons named in headlines (presumed innocent; India's DPDP Act 2023) | Public case summaries are **generated from extracted facts** (kind · species · quantity · place). Headlines are kept only in `data/interim` (gitignored). Arrests are published as counts. |
| Sellers' phone numbers and handles in listings | `privacy.scrub` removes phones, e-mails, WhatsApp/Telegram links and @handles. `assert_public_safe` fails the build if any remain or if a field such as `channel`, `author` or `person` appears. CI repeats the check. |
| Re-identification through channel names | Channel is only a CV grouping key. It is never a model feature and never published. |
| Analyst's own investigative data | The Workbench stores user entities in the browser's localStorage. Nothing is uploaded, and there is no server to upload to. |

**Rule for contributors:** a pull request that adds person-level data to
`web/data` will be rejected, whatever the source.

## 2. Sources

- robots.txt is respected (`collect/base.py`), with fixed per-host delays and a disk cache so pages are not fetched twice.
- Sources whose terms restrict reuse (Google News RSS, YouTube) are **off by default**, and `sources.yaml` records each source's terms.
- Only derived facts are republished, each with a link to the original. No article text is copied.

## 3. Readers

- Every case shows its sources, a confidence score, and the note that extraction is automatic and can be wrong.
- The classifier's metrics come from a locked, seller-grouped test split, not training data. Their limits (label noise, the plateau) are stated on the site.
- CITES appendix labels apply to whole groups. Readers are told to check Species+ for individual taxa and populations.
- Media-derived seizure data is biased towards charismatic species, English-language outlets and places with active reporters. A map of reported seizures shows where enforcement and reporting happen, which is not the same as where trafficking happens. Say so when you use it.

## 4. Security

- Static site: no server-side attack surface and no user accounts.
- External scripts come only from jsDelivr, with pinned versions.
- If you deploy a fork with private data, keep `data/private`, `data/interim` and `models/` out of the published artifact. `update.yml` uploads only `web/`.
