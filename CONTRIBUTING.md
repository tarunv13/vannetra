# Contributing to WildTrace

Thank you for helping. The most valuable contributions here are not code.

## Report a wrong case

Every case panel on [the Atlas](https://tarunv13.github.io/wildtrace/) has **Report a
correction**, which opens an issue with the case ID filled in. Say what is wrong and link a source
that shows it. Wrong place, wrong species, two cases that are really one, or an item that is not
wildlife trade at all: all are worth reporting.

## Validate a case

Reviewers record checked cases in
[`pipeline/wildtrace/resources/validations.yaml`](pipeline/wildtrace/resources/validations.yaml):

```yaml
83b377a8135b:
  status: validated        # or: rejected
  reviewer: your name or handle
  date: 2026-09-22
  note: Checked against the IBAMA release; species and place match.
```

`validated` cases are marked as checked on the site; `rejected` cases are dropped at the next
build. Open a pull request with your entries, and say how you checked.

## Add species terms or a language

[`pipeline/wildtrace/resources/lexicon.yaml`](pipeline/wildtrace/resources/lexicon.yaml) holds the
species groups, their terms per language, the trade code words and the negative cues that reject
look-alikes. Adding local-language terms is the single best way to widen coverage. Keep terms
specific: a term that also means something ordinary will flood the pipeline with noise.

## Add a source or an observatory

- News and official feeds: [`resources/sources.yaml`](pipeline/wildtrace/resources/sources.yaml),
  with `access`, `terms` and `enabled`. Respect each site's terms; anything that needs opt-in
  stays behind a flag.
- Datasets and dashboards:
  [`resources/observatories.yaml`](pipeline/wildtrace/resources/observatories.yaml). Include what
  it holds and its access terms, and check the link before submitting.

## Code

```bash
pip install -e ".[dev]"
pytest -q            # 41 tests
ruff check .
```

The front end has no build step: plain ES modules, so edit `web/js/*.js` and reload. Please keep
each case traceable to a phrase in its source, keep the privacy gate passing, and match the
surrounding style rather than introducing a new one.

## What will not be merged

- Anything that publishes a person's name, phone number, address or seller identity, even from a
  public report. This is the project's hard line.
- Scraping that ignores robots.txt or a site's terms.
- Decoded Google News links.

By contributing you agree your work is released under the repository's licences: MIT for code,
CC BY 4.0 for data.
