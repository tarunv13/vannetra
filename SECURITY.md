# Security and data protection

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](https://github.com/tarunv13/wildtrace/security/advisories/new)
rather than a public issue. Include what you found and how to reproduce it. Expect a first reply
within a week.

## What WildTrace publishes

The published data contains events, not people. The build applies a privacy gate that fails if a
name, phone number, e-mail address, social handle or seller identity appears in any published
file, and CI runs the same check on every push. Arrests are counts only.

If you find personal data in the published output, that is a privacy incident, not a feature
request. Report it privately as above and it will be removed and rebuilt.

## What stays on your machine

Anything you import in **Investigate** is held in your browser's local storage and is never
uploaded. Clearing it from the panel removes it. The site has no accounts and self-hosts its fonts.

It does run **Microsoft Clarity**, which records interactions and session replays and sets
cookies. Clarity is loaded with text masking on, so typed text such as a search query is not
carried into a replay, and it is skipped when the browser sends a Global Privacy Control signal.
If that matters for your work, block `clarity.ms`, use a private window, or run the site
yourself: deleting `data-clarity` from `web/index.html` removes it completely.

## Raw collection data

Collected articles and listings live in `data/` and are not published. They can contain seller
details and personal information, so they are gitignored and must stay out of the repository.
