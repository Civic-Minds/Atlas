# Free child fares

**Status:** Complete for the reviewed sample. 41 agencies remain unresolved.

Snapshot date: `2026-10-11`
Scope: every agency in the Atlas registry (697 agencies in 78 regions,
mostly in Canada, the United States and France)

## Research question

Up to what age does each Atlas agency let children ride free, and under what
conditions? The target is a genuinely free child fare. Paid child or youth fares
are kept as context only.

## Sample

All 697 agencies in `public/data/index.json` at the snapshot date. One record
per agency, keyed by `slug`. Review date: 2026-10-11.

## Method

- Primary source: the agency's own fare page, or its city, county or municipal
  fare bylaw or tariff. Neighbouring agencies, GTFS fare values, search
  snippets and aggregators (Moovit, Wikipedia, transit.wiki) are not evidence.
- Discovery: `npm run research:child-fares`
  ([`scripts/research-free-child-fares.mjs`](../../../scripts/research-free-child-fares.mjs))
  opens each agency site in a headless browser and records candidate pages in
  `official-site-candidates.json`. Candidates are leads only, never results.
- Manual verification: each agency's policy was read from the official source
  and recorded in `manual-verified-child-fares.json` with a verbatim
  `evidenceQuote` and its `sourceUrl`.
- Ledger build: `npm run research:child-fares:ledger`
  ([`scripts/build-child-fare-ledger.mjs`](../../../scripts/build-child-fare-ledger.mjs))
  joins the registry with the manual records and writes the JSON, CSV and
  Markdown ledger. Rerun it after any edit to the manual file. Do not edit the
  generated ledger files by hand.
- Age convention: `free_child_age` is the inclusive maximum free age ("under 6"
  gives 5; "under 4 on a lap" gives 3).
- Conflicts: when official sources disagree, the narrower rule is used and both
  are recorded in `conditions`.
- Quote check: in the second pass (the 103 then-unresolved rows plus five dead
  or misread rows), the page text was saved and each quote was checked by
  script for an exact match after whitespace and quote-mark normalization.

## Results and interpretation

`status: confirmed` means an official source documents the agency's
child-fare policy. It does not mean children ride free. Use `policy_type`.

| policy_type | Agencies | Meaning |
|---|---:|---|
| `age` | 487 | Children up to `free_child_age` ride free, sometimes with accompaniment or height conditions |
| `age-conditional` | 5 | Free up to an age only under a program (seasonal, pass or residency); not a general "kids under N ride free" |
| `all-fare-free` | 83 | The whole system is fare-free for every rider |
| `height` | 39 | Free below a height line, with no age rule |
| `student-program` | 26 | Free or reduced only through a student, grade or youth program |
| `no-free-child-fare` | 16 | The official source shows no free child fare |
| `unresolved` | 41 | No current official statement was found |

Among `age` rows, the most common cutoffs are 5 (156 agencies), 4 (100),
3 (47), 18 (47) and 12 (45). Free fares up to 17 or 18 are usually youth
programs that the source states as a plain age rule.

## Recommendation

No decision. This is research data. Any Atlas display should filter on
`policy_type`, not `status`, and should not present `age-conditional` rows as a
general child fare.

## Limitations and next steps

- **41 unresolved agencies.** Reasons include official sites that block
  automated access (for example Valley Metro, Kenosha, Grand Forks, Mason City,
  Amiens), fare pages with no child rule, paratransit-only operators (B-Line),
  conflicting official pages (Hobbs), expired fare tables (Corona) and rules
  with no numeric age (MATBUS, Miami-Dade "preschoolers"). Each row's
  `conditions` says what was checked.
- **8 quotes are content-confirmed, not verbatim:** `unioncity`, `riovista`,
  `lirr`, `mnr`, `tulare-county-transit`, `bettendorf`, `thousand-oaks` and
  `evreux` (`quoteCheck: content-confirmed-not-verbatim`). These sites could
  only be read through a browser-rendering fetch, a search-engine copy
  (Rio Vista) or a fare-table image (Bettendorf), so the exact characters could
  not be checked.
- **First-pass quotes were sampled, not fully re-checked.** A 2026-10-11 audit
  of 30 confirmed first-pass rows found 24 of 26 checkable quotes verbatim, 2
  matching in substance and no fabrications. Rows without `quoteCheck` come
  from that first pass.
- **Time-sensitive.** Seasonal and pilot programs (for example the 2026 summer
  youth programs) and temporary fare-free periods will go stale. Treat this as
  a dated snapshot and start a new folder for a new pass.
- **Several source URLs moved** during the second pass (for example Grenoble
  to M réso, Thousand Oaks to toaks.gov, Greeley-Evans to greeleyco.gov). The ledger records the current URL.

## Supporting artifacts

| File | Purpose |
|---|---|
| `free-child-fare-ledger.json` | Authoritative ledger, one record per agency (generated) |
| `free-child-fare-ledger.csv` | Flat export, including `policy_type` and `free_child_age` (generated) |
| `free-child-fare-ledger.md` | Counts by research status and policy type (generated) |
| `manual-verified-child-fares.json` | Hand-maintained source records; edit this, then rebuild |
| `official-site-candidates.json` | Discovery output; leads, not results |

### Record fields

- `status`: `confirmed` (an official source documents the policy) or
  `unresolved`.
- `policy_type`: see the table above.
- `free_child_age`: inclusive maximum free age, set only for `age` and
  `age-conditional`.
- `cutoffMeaning`: a more detailed label with standardised spelling (for
  example `inclusive`, `all-riders-free`, `height-based`,
  `inclusive-seasonal-program`).
- `conditions`: accompaniment, limits, program details, conflicts. For
  unresolved rows, this holds research notes.
- `evidenceQuote`: verbatim text from `sourceUrl` only, never a note.
- `quoteMethod` and `quoteCheck`: present on second-pass rows; record how the
  page was read and whether the quote matched exactly.
