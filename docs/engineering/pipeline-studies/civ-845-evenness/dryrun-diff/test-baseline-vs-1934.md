# Dry-run diff report

- Baseline: baseline (commit 228825efd, runAt 2026-11-19T16:50:51Z)
- Candidate: c1934 (commit 8111e820f, runAt 2026-11-19T17:38:07Z)

## Headline

- Agencies compared: 526 (69183 route/day/direction rows); countries: United States 441, Canada 85.
- Excluding drt: 525 agencies in 2 countries (United States, Canada). "Six additional agencies in two countries" (not counting DRT): SATISFIED by coverage (coverage = compared, not necessarily affected; stop-level pooled values need the agencies input, see usage).
- Changed cells: 0 total; value cells (figures, headlines, stops): 0. Published -> none: 0. none -> published: 0. Changed value to value: 0. Crossed a tier boundary: 0.
- Focus (drt route 900) changed cells: 0. Collateral (everything else): 0 cells (0 value cells) in 0 agencies.
- Stop-level compared: no (route-level artifact only; pass --baseline-stops/--candidate-stops).
- Agencies with output on one side only (NOT compared cell by cell, see section below): kingcountymetro (baseline only).
- Agency status differences (report.json): columbia-county-rider: absent -> skipped; kingcountymetro: processed -> refused.

## Agencies with output on one side only

An agency in the baseline but missing from the candidate was refused or failed there (no output, so every figure is effectively published -> none). The reason comes from report.json.

| Agency | Country | Side | Rows on that side | Baseline status | Candidate status | Candidate reason |
|---|---|---|---|---|---|---|
| kingcountymetro | United States | baseline only | 803 | processed | refused | release diff gate: mode-lost: loses Tram/Light Rail (live Bus, Ferry, Tram/Light Rail; new Bus, Ferry) (pass --allow kingcountymetro:mode-lost after review) |

## Per agency

| Agency | Country | Routes | Rows | Changed cells | Value cells | Published->none | none->published | Tier changes | Delta min | median | max |
|---|---|---|---|---|---|---|---|---|---|---|---|
| (no changes) | | | | | | | | | | | |

Delta columns are after minus before, value-to-value cells only.

## Top changed routes

| Agency | Route | Changed cells | Largest delta (min) | Published->none | none->published |
|---|---|---|---|---|---|
| (none) | | | | | |

## Newly refused (published -> none) (0)

None.

## Newly published (none -> value) (0)

None.

## Collateral: changes outside drt route 900 (0)

None.

## Changes on drt route 900 (0)

None.

