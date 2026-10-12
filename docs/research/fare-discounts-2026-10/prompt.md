# Transit fare discount research: Atlas agencies (October 2026)

You are doing official-source research on transit fare discount programs for a list of North American transit agencies. I have attached `agencies.csv`, which lists 549 agencies with these columns: `batch, slug, agencyName, region, country, cities, officialWebsite, knownFarePageUrl`.

**Run only one batch per session.** I will tell you which one, for example "Run batch B03". If I don't say, run the first batch in the batch table below that is not listed as done in a checkpoint I pasted in. Research every agency in that batch (filter `agencies.csv` on the `batch` column). Do not start the next batch.

---

## 1. What to research

**The focus is low-income or income-based reduced fare programs.** Examples: Clipper START, LA Metro LIFE, ORCA LIFT, Toronto Fair Pass, Calgary low-income transit pass, RTD LiVE, MTA Fair Fares NYC. Spend most of your effort here. For each agency, check whether:

- the agency runs its own low-income program;
- it takes part in a regional program run by another agency or body;
- a city, county, state or provincial program covers its riders (for example, a city-run pass that the agency honors).

**Also record the other standard discount categories**, but more briefly:

- seniors
- youth / children
- students
- people with disabilities, including Medicare-card or similar reduced fare on fixed routes
- veterans / military

**Out of scope:** paratransit or ADA complementary service fares, employer or university bulk passes (U-Pass, ecopass) unless they are open to low-income individuals, one-off promotions, and fare-free days.

If an agency is fare-free for everyone, record one row with `programCategory` = `fare-free`, cite the official page, and do not look for discounts.

---

## 2. Sourcing rules (strict)

1. **Official sources only.** A valid `sourceUrl` must be on:
   - the agency's own website (start at `officialWebsite`; `knownFarePageUrl`, where filled, is a fare page we verified in September 2026);
   - the website of the city, county, regional authority, MPO, state or provincial government, or transit agency that runs the program;
   - an official program site run by one of those bodies (for example clipperstartcard.com or the TAP / LIFE site).

   **Never cite:** Wikipedia, Moovit, the Transit app, Google results or AI summaries, news articles, Reddit, blogs, nonprofit roundups, or any other third party. You may use third-party pages only to discover that a program exists. The figures must then be confirmed on an official page.

2. **Cite only pages you actually opened in this session** and that show the figure. Do not construct or guess URLs. Prefer the most specific page (the program page or fare table, not the homepage). PDFs from official domains are fine.

3. **Never guess or fill from memory.** If no official page confirms a field, write `not found` in that field. This applies especially to income thresholds, discount amounts and dates. Do not calculate a dollar threshold from an FPL percentage yourself. If the page states only "200% FPL", put `not found` in `incomeThresholdSingle` and `200% FPL` in `incomeThresholdBasis`.

4. **Agencies with no program get a row too.** If you find no discount program of any kind, write one row with `researchStatus` = `none-found`, and in `pagesSearched` list every official URL you checked. If an agency has discounts for other groups but no low-income program, give it a separate `programCategory` = `low-income`, `researchStatus` = `none-found` row with its pagesSearched filled, so the absence is explicit.

5. **Evidence.** For every program row, quote a short verbatim sentence or fare-table line (under 40 words) from the source page in `evidence`.

6. **Keep the two kinds of missing apart.**
   - `not found` is for a single field: the program exists, but the page doesn't state that detail.
   - `none-found` is a row-level `researchStatus`: no program was found at all.

---

## 3. Output format

**One row per agency per program.** If a regional program covers six agencies in the batch, write six rows (one per honoring agency) that share the same `programId`. Every slug in the batch must appear in at least one row.

Deliver the results as **one CSV inside a single code block** at the end of your answer, then the checkpoint block (section 5). Keep any prose summary to five lines or fewer, placed above the CSV. Quote every field with double quotes. Separate list values inside a field with `; `.

Columns, in this exact order:

```
batch,slug,agencyName,region,country,researchStatus,programId,programName,programCategory,eligibleGroup,incomeThresholdSingle,currency,incomeThresholdBasis,incomeThresholdYear,discountType,discountValue,enrollmentMethod,verificationMethod,modesCovered,allFixedRouteModes,regionalProgram,administeringBody,honoringAgencies,sourceUrl,officialWebsite,pagesSearched,effectiveDate,dateAccessed,evidence,confidence,notes
```

Column definitions:

| Column | What goes in it |
|---|---|
| `batch`, `slug`, `agencyName`, `region`, `country`, `officialWebsite` | Copy exactly from `agencies.csv`. |
| `researchStatus` | One of: `verified-official` (program confirmed on an official page with its main terms); `partial-official` (program confirmed officially, but key terms such as threshold or discount are `not found`); `none-found` (no program found after searching); `official-site-inaccessible` (site down, blocked or unusable); `no-official-website`. |
| `programId` | A stable kebab-case ID for the program, the same in every row and batch, e.g. `clipper-start`, `orca-lift`, `lacmta-life`, `ttc-fair-pass`, `sfmta-senior`. For an agency-specific program use `<slug>-<category>`, e.g. `barrie-senior`. Leave it blank for `none-found` rows. |
| `programName` | The official program or fare name as written on the source. |
| `programCategory` | One of: `low-income`, `senior`, `youth`, `student`, `disability`, `veteran`, `fare-free`, `other`. |
| `eligibleGroup` | Who qualifies, in the source's terms (e.g. "adults 19-64 with income at or below 200% FPL", "65+", "ages 6-18"). |
| `incomeThresholdSingle` | Annual gross income cap for a one-person household, digits only (e.g. `31300`). It must appear on an official page. Otherwise `not found`. Low-income rows only; leave it blank for other categories. |
| `currency` | `USD`, `CAD` or `MXN`. |
| `incomeThresholdBasis` | The basis as stated: e.g. `200% FPL`, `150% FPL`, `80% AMI`, `LICO`, `LIM-AT`, `Market Basket Measure`, `enrolled in SNAP/Medicaid/etc.`, or `not found`. |
| `incomeThresholdYear` | The year or effective date of the threshold table (FPL and LICO change every year), or `not found`. |
| `discountType` | One of: `percentage`, `flat-fare`, `free`, `free-rides-allowance`, `pass-discount`, `credit`, `other`. |
| `discountValue` | The discount as stated: e.g. `50% off single rides`, `$1.00 reduced fare vs $2.50 adult`, `free`, `$50 monthly pass vs $100`. |
| `enrollmentMethod` | How to apply: online, in person (where), by mail, through a social-services office, card issued on the spot, etc. |
| `verificationMethod` | Proof required: benefit enrollment (SNAP, Medicaid, EBT, ODSP, etc.), tax return or notice of assessment, ID showing age, disability card, self-certification. Write `not found` if unstated. |
| `modesCovered` | The modes the discount applies to, from: `bus; rail; light rail; subway; commuter rail; ferry; streetcar; brt; microtransit`. Paratransit does not belong here. |
| `allFixedRouteModes` | `yes`, `no` or `not found`: does the discount apply to all of the agency's fixed-route modes? Ignore paratransit when deciding. If `no`, say what is excluded in `notes`. |
| `regionalProgram` | `yes` if the same program is honored by more than one agency, otherwise `no`. |
| `administeringBody` | Who runs the program (the agency, a regional body such as MTC, a city, a state/province). |
| `honoringAgencies` | For regional programs: every agency the official source lists as honoring it, by name, including agencies outside this batch. Otherwise blank. |
| `sourceUrl` | The single most specific official URL confirming the terms. |
| `pagesSearched` | Required for `none-found`, `partial-official` and `official-site-inaccessible` rows: every official URL you checked. Optional otherwise. |
| `effectiveDate` | Effective date of the fare or program terms if the page states it, otherwise `not found`. |
| `dateAccessed` | The date you opened the source, `YYYY-MM-DD`. |
| `evidence` | A short verbatim quote from the source (rule 5). |
| `confidence` | `high` (an official page states the figure directly and is current); `medium` (official, but dated, a PDF of uncertain currency, or the figure is only partly stated); `low` (official page is ambiguous or contradicts another official page; explain in `notes`). |
| `notes` | Anything else: conflicts between pages, excluded modes, pending fare changes, the program being paused or closed to new applicants. |

---

## 4. Method, per agency

1. Open `officialWebsite`, and `knownFarePageUrl` if filled. Find the fares page, then any "reduced fare", "discount", "low-income", "LIFE", "equity fare" or "income-based" pages. Also use the site search if there is one.
2. Check for a regional program: the regional fare card's site, the regional authority, the MPO or the state DOT.
3. For a Canadian agency, also check the municipality's social-services or recreation-subsidy pages. Many Canadian low-income passes are run by the city, not the transit department.
4. Record what you find in the columns above. Move on once an agency is done. Do not spend the batch on one agency.
5. If a program in `programIds already recorded` (from a checkpoint I pasted) covers this agency, don't re-research its terms. Write the row for this agency with that `programId`, copy the terms, and confirm that the official source lists this agency as honoring it.

---

## 5. Checkpoint (always end with this)

After the CSV code block, output this block, filled in, as a second code block:

```
CHECKPOINT
batchCompleted: B__
dateRun: YYYY-MM-DD
agenciesInBatch: __
slugsCovered: slug1; slug2; ...
slugsMissing: (slugs in the batch with no row; should be empty, or explain why)
rowsWritten: __
counts: verified-official __ | partial-official __ | none-found __ | official-site-inaccessible __ | no-official-website __
lowIncomeProgramsFound: programId1 (agencies: slugA; slugB); programId2 (...)
programIdsAlreadyRecorded: (every programId recorded in this batch and in any checkpoint I pasted, with programName, administeringBody, sourceUrl)
openQuestions: (conflicts or items to re-check, one per line)
nextBatch: B__
```

If you run out of room before you finish the batch, stop at a clean agency boundary, output the CSV for what's done plus the checkpoint with `slugsMissing` filled. I will paste that checkpoint into a new chat and ask you to finish those slugs.

**To continue in a new chat**, I will paste this prompt, attach `agencies.csv`, paste the latest checkpoint, and say "Run batch B__". Reuse `programIdsAlreadyRecorded` for consistent IDs.

---

## 6. Batch table

21 batches, 549 agencies. Regional programs are kept within one batch where possible: the Bay Area (Clipper START) in B03, LA County (LIFE) in B01, the DC area in B15, NYC metro in B17 and the GTHA in B19.

| Batch | Agencies | Regions |
|---|---|---|
| B01 | 27 | California: LA County and Ventura County |
| B02 | 15 | California: Orange County, Inland Empire, San Diego, Imperial, desert |
| B03 | 28 | California: San Francisco Bay Area, Santa Cruz, North Bay |
| B04 | 27 | California: Sacramento, Central Valley, Central Coast, North |
| B05 | 26 | Washington (24), Alaska (2) |
| B06 | 23 | Oregon (15), Idaho (3), Hawaii (3), Nevada (2) |
| B07 | 29 | Colorado (22), Montana (3), Utah (2), Wyoming (2) |
| B08 | 30 | Texas (20), New Mexico (6), Arizona (3), Ciudad de México (1) |
| B09 | 31 | Iowa (12), Missouri (4), Kansas (3), Minnesota (3), North Dakota (3), Nebraska (2), Oklahoma (2), South Dakota (2) |
| B10 | 28 | Wisconsin (11), Illinois (10), Indiana (7) |
| B11 | 31 | Michigan (14), Ohio (14), Kentucky (3) |
| B12 | 21 | Louisiana (7), Tennessee (5), Alabama (4), Mississippi (3), Arkansas (2) |
| B13 | 30 | Florida (20), Georgia (10) |
| B14 | 22 | North Carolina (17), South Carolina (5) |
| B15 | 27 | Virginia (17), Maryland (5), Washington DC (2), West Virginia (2), Delaware (1) |
| B16 | 20 | Pennsylvania (20) |
| B17 | 35 | New York (29), New Jersey (4), Connecticut (2) |
| B18 | 11 | Massachusetts (4), Maine (2), New Hampshire (2), Vermont (2), Rhode Island (1) |
| B19 | 35 | Ontario (35) |
| B20 | 25 | Quebec (19), New Brunswick (3), Nova Scotia (1), Prince Edward Island (1), Newfoundland (1) |
| B21 | 28 | British Columbia (14), Alberta (6), Saskatchewan (4), Manitoba (2), Northwest Territories (1), Yukon (1) |

Start now with the batch I name below.

**Batch to run:** B01
