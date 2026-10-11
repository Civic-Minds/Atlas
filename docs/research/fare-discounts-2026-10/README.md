# Fare discounts

**Status:** NOT VERIFIED: audit found problems; fix pending (Linear CIV-48).

Snapshot date: `2026-10-10` (files last rebuilt 2026-10-11)
Scope: 549 Atlas agencies in Canada, the United States and Mexico

## Research question

Which reduced-fare programs does each Atlas agency offer, with a focus on
low-income or income-based fares (for example Clipper START, ORCA LIFT, Fair
Fares NYC)? Senior, youth, student, disability and veteran discounts are
recorded more briefly.

## Sample

The 549 agencies in `agencies.csv`, split into 21 batches (B01-B21). Each
agency has one or more rows, one per program, so there are 640 rows. Out of
scope: paratransit or ADA complementary fares, employer or university bulk
passes, one-off promotions and fare-free days.

## Method

- An AI researcher ran one batch per session using the rules in `prompt.md`,
  and wrote a checkpoint for each batch.
- Sources must be official: the agency, the government body that runs the
  program, or an official program site. Evidence must be quoted word for word
  from the cited page.
- An independent audit on 2026-10-10 (`audit-2026-10-10.md`) checked structure,
  timestamps, a 30-row sample and every none-found row.
- `fix-prompt-2026-10-10.md` gave the researcher the corrections to make.
  `rebuild-report-2026-10-10.md` (written 2026-10-11) is the researcher's own
  account of the fixes. It has not been independently re-audited.

## Results and interpretation

Current files, as reported by the rebuild and recounted from the CSVs:

| researchStatus | Rows |
|---|---:|
| `verified-official` | 592 |
| `partial-official` | 6 |
| `none-found` | 42 |

By program category: low-income 178, other 155, disability 122, fare-free 59,
senior 57, standard-discount 39, student 10, youth 8, veteran 6. 6 rows use a
blank or nonstandard category (`universal`, `general-reduced`).

Treat these counts as unverified until CIV-48 closes.

## Recommendation

No decision. Do not use this data in Atlas until an independent quote-on-page
check passes.

## Limitations and next steps

**Audit findings (2026-10-10), before the rebuild:**

- **Verdict: partly usable, not usable as-is.**
- 186 verified rows were shells, with only a URL and a quote and no program,
  amount or eligibility. These were all of B18-B21, plus rows in B06-B09,
  B11-B13 and B15.
- In a 30-row sample, 16 of 28 fetched rows had a verbatim quote that supported
  the claim (57%), and 23 of 28 were supported in substance (82%). The failures
  were reworded or misattributed quotes presented as verbatim (Redwood Coast,
  RiverCities, TriMet, Staten Island Ferry, Durango), quotes not on the cited
  page (MARTA, the BC Transit rows, the exo rows, SMART Telluride) and a
  paratransit fare tagged as a discount (Mason City).
- Non-official sources: a Vercel preview for Greeley, the airport site for
  Dubuque, Pace's site for Metra, a vendor site for Clemson. Many B20-B21 rows
  cited homepages.
- Wrong statuses: CUE (fare-free, not none-found), Saint-Jean-sur-Richelieu
  (has senior, student and youth fares), GET Bakersfield (has reduced fares),
  WVU PRT and Tampa Airport (should be fare-free), and duplicate rows.
- The researcher's claim that only B04 and B21 were updated was false: every
  CSV from B04 to B21 had the same timestamp, and the checkpoints were written
  30-60 seconds apart.

**After the rebuild (not yet verified):** the rebuild report says the shell rows
were filled, the listed statuses and sources were corrected (CUE, GET,
Saint-Jean-sur-Richelieu, Greeley and others now cite official pages), 77
repeated rows were removed and Mason City paratransit was excluded. A recount
of the CSVs confirms that no verified row has a blank program, eligibility or
amount field. The quotes themselves have not been re-checked against the cited
pages.

**Next step:** re-run the audit's automated quote-on-page check across all
verified rows, and spot-check the corrected agencies, before marking this
folder verified (CIV-48).

**Overlap with other research:**

- [`fare-discount-comparison-2026-02`](../fare-discount-comparison-2026-02/README.md):
  an earlier, unverified California-only prototype of low-income programs.
  This folder supersedes it in scope.
- [`fare-inventory-2026-09-29`](../fare-inventory-2026-09-29/) and
  [`fare-inventory-2026-09-30`](../fare-inventory-2026-09-30/README.md): the
  September base fare inventory. `knownFarePageUrl` in `agencies.csv` holds
  fare pages verified in September 2026, the same period. Discount amounts
  here should agree with base fares there.

## Supporting artifacts

| File | Purpose |
|---|---|
| `fare-discounts-B01-2026-10-10.csv` ... `B21` | Canonical output, one row per agency program |
| `agencies.csv` | Input agency list with batch, official website and known fare page |
| `prompt.md` | Research rules and output schema |
| `checkpoint-B01-2026-10-10.md` ... `B21` | Per-batch checkpoints |
| `audit-2026-10-10.md` | Independent audit of the October 10 pass |
| `fix-prompt-2026-10-10.md` | Corrections requested after the audit |
| `rebuild-report-2026-10-10.md` | Researcher's report on the rebuild (unverified) |
| `archive-stale/` | Superseded files kept for history: an early B07 CSV that still has not-yet-checked rows, and a B08 checkpoint with the old file-name pattern |
