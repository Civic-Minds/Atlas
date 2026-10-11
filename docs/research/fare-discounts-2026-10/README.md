# Fare discounts

**Status:** VERIFIED WITH EXCEPTIONS (2026-10-11). Every non-none-found row was checked against a freshly fetched official page, and none is known to be off-page. 403 of 596 (68%) are verbatim and 127 (21%) near-verbatim. The exceptions: 43 rows on 42 agency sites that block automated fetches, plus 22 rows confirmed only through a browser fetch (Linear CIV-48).

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

Current files after the 2026-10-11 repair (the rebuild reported 592 / 6 / 42):

| researchStatus | Rows |
|---|---:|
| `verified-official` | 571 |
| `partial-official` | 25 |
| `none-found` | 44 |

By program category: low-income 178, other 155, disability 122, fare-free 59,
senior 57, standard-discount 39, student 10, youth 8, veteran 6. 6 rows use a
blank or nonstandard category (`universal`, `general-reduced`).

Treat these counts as unverified until CIV-48 closes.

### Verification pass (2026-10-11)

An independent check of the rebuilt files, run after the rebuild report.

**Quote check.** 200 unique `sourceUrl`s were sampled (seed 20261011,
including every URL behind an audit fix), covering 242 verified or partial
rows. Each page was freshly fetched with curl (PDFs through `pdftotext`) and
the row's quote was compared after normalising whitespace and quote marks.

| Result | Rows | Share of the 212 checkable rows |
|---|---:|---:|
| Verbatim on the cited page | 100 | 47% |
| Near-verbatim (at least 80% of the quote's words on the page, but reworded or split) | 61 | 29% |
| Not on the cited page | 32 | 15% |
| Evidence is a description, not a quote (all in B02-B03) | 19 | 9% |
| Fetch failed (403, 404, timeout; not checkable) | 30 | not counted |

- **B01-B03 have a column shift:** in some rows the quote sits in
  `dateAccessed` and `evidence` holds the confidence word. B02-B03 rows often
  hold a description ("Official fares page lists ...") instead of a quote.
- **B19 and B20 are weakest:** 16 of their 24 checkable sampled rows are not on
  the cited page.
- **B11, B12, B14 and B21** had no not-on-page results in the sample.

**Audit fixes, checked by hand (15 rows, 13 agencies):** 8 fixed, 6 partly
fixed, 1 not fixed.

- **Fixed:** CUE (fare-free), Greeley (now greeleyco.gov, but the two Greeley
  rows are duplicates), MARTA reduced fare, Mason City (paratransit removed;
  the page could not be loaded to confirm nothing else), RiverCities, TriMet,
  Staten Island Ferry.
- **Partly fixed:**
  - GET and Saint-Jean-sur-Richelieu: rows say "amount not found", but the
    cited pages list reduced prices (GET $.80 single, $28 31-day; SJSR monthly
    44 $).
  - Cowichan (BC Transit): the quote is now on the page, but the $45 fee is
    not.
  - Redwood Coast: the quote is verbatim, but the page says the free fares were
    grant-funded only through September 2025.
  - SMART Telluride: the cited PDF is dead; the quote matches an archived
    November 2024 board packet, not a current fare page.
  - MARTA homeless-ticket row: it cites a `dev.itsmarta.com` test address; the
    live page is `itsmarta.com/tsp_home.aspx`.
- **Not fixed:** exo Presqu'île. The cited page now redirects to the general
  fares page, and the French quote is not on it.

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

### Repair pass (2026-10-11)

- **Column shift:** 14 B01 rows were missing `pagesSearched`, so every later
  field was one column off. Fixed.
- **Re-researched 121 rows** from official pages: the 32 not-on-page rows, all
  54 B02-B03 rows whose evidence was a description, the 30 sampled rows whose
  fetch had failed, and the audit-fix rows. New quotes were machine-checked
  against the saved page text: 96 verbatim, 0 mismatches, 11
  content-confirmed only (sites readable only through a browser fetch), 1 now
  none-found. 13 rows stay as they were because the official site blocked
  every automated fetch (`quoteCheck: fetch-blocked`, for example Torrance,
  RTC Southern Nevada, Amarillo, Wichita, LADOT, Kern Transit).
- **Audit fixes:** GET ($0.80 reduced single fare) and Saint-Jean-sur-Richelieu
  amounts filled; Cowichan's $45 found on BC Transit's seniors page; MARTA
  re-cited to the live itsmarta.com page; exo Presqu'île and other exo/RTL rows
  now cite ARTM, the regional fare authority (amounts on the ARTM page are
  partly missing, so some are `partial-official`); SMART Telluride is
  `partial-official` (the free routes are confirmed, the off-season page is
  gone); Redwood Coast's free fares are still advertised on the homepage, so
  the "through September 2025" note on its fares page looks stale (both are in
  the notes); Greeley's youth row, a copy of the senior row, now states the
  real youth free-fare rule.
- **Corrections found along the way:** several rows had out-of-date amounts
  or groups (for example Casper, Modesto, Belleville, VINE's Clipper START at
  20%, Halifax, Sherbrooke, GRT) and were updated. Petaluma's and SamTrans's
  pilots have passed end dates on official pages and are `partial-official`.
- **Near-verbatim:** the 59 rows that matched in substance but not word for
  word are marked `quoteCheck: near-verbatim` and are not counted as verbatim.

### Full check of the remaining rows (2026-10-11)

The 321 rows outside the first sample were checked the same way, with 288
pages fetched. 157 were verbatim and 68 near-verbatim. The other 96 were
re-researched: 39 had quotes not on the page and 57 had failed fetches. New
quotes were machine-checked: 53 verbatim, 0 mismatches, 11
content-confirmed, 1 now none-found and 1 image-only (Bettendorf's fares exist
only as an image). 30 stayed blocked.

Along the way, several rows were corrected. Bustang's senior and disability
discount is 50%, not 25%. CapMetro's quote was the low-income program's, not
reduced fare. Kingston, Stratford, Cascades East, CobbLinc and others had
stale values. REM's free 65+ travel is limited to Montréal-area residents.
Four sites moved: Key West, Mountain Metro, Sarnia and Roseville.

### Final quoteCheck counts (640 rows)

| quoteCheck | Rows |
|---|---:|
| `verbatim` | 403 |
| `near-verbatim` | 127 |
| `content-confirmed-not-verbatim` | 22 |
| `fetch-blocked` | 43 |
| `image-only` | 1 |
| `not-applicable` (none-found) | 44 |

### Still blocked (needs a real browser)

43 rows on 42 agency sites refused every automated fetch, so their evidence is
from the original research and was not re-verified: ace, amarillo, b-line,
breck-free-ride, burbankbus, clemson-cat, fax, fort-smith, glendalebeeline,
grand-forks, greensboro, iowa-city, janesville, kenosha, kern-transit, ladot,
las-cruces, marathon-county, maui-county, mendocino, mexico-city-metro, mmvta,
pgc-the-bus, riovista, rtcsnv, sheboygan-county, simi-valley, slotransit, smat,
south-bend, spokane, taft, tampa-international-airport, tcat, tor,
torrance-transit, um-transit, vail-transit, valleymetro, visalia, vre,
wichita. Two of these (ace, riovista) still hold description text rather than
a quote.

**Next step (CIV-48):** fetch the blocked sites in a browser, and tighten the
127 near-verbatim quotes if exact wording matters.

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
| `rebuild-report-2026-10-10.md` | Researcher's report on the rebuild |
| `verification-2026-10-11-quote-check.json` | Per-row results of the 2026-10-11 quote check |
| `verification-2026-10-11-audit-fixes.json` | Hand check of the 15 audit-fix rows |

The CSVs have a `quoteCheck` column: `verbatim` (exact match on freshly fetched
official text), `near-verbatim` (substance matches, wording differs),
`content-confirmed-not-verbatim` (read through a browser fetch only),
`fetch-blocked` (official site refused automated fetches; not re-verified),
`unchecked` (not in the 2026-10-11 sample) or `not-applicable` (none-found).
| `archive-stale/` | Superseded files kept for history: an early B07 CSV that still has not-yet-checked rows, a B08 checkpoint with the old file-name pattern, and an early B03 checkpoint (`checkpoint-B03-2026-10-10-early.md`, from a separate `fare-discounts-2026-10-10` folder) |
