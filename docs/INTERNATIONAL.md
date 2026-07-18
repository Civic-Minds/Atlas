# International Expansion

Research and planning for taking Atlas coverage beyond Canada/US. Half roadmap, half research log — capturing what's actually been found country by country, since that reasoning doesn't fit the terse todo format of [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md).

---

## Why expand internationally

Atlas's coverage has been exclusively Canada/US to date. Mexico (Mi Transporte / Guadalajara) was added as the first test of coverage outside that footprint. The open question this doc tracks: how much of what we learned from Mexico's messy feed is a *Mexico* problem versus a *first-country-of-any-kind* problem — and which country should come next.

---

## Mexico — first country, currently hidden from production

Mi Transporte (Guadalajara) was added, then found to have real, unrelated data-quality issues once put under scrutiny:

- **#219 / #244 — corrupted shape data.** Route T14B has two broken shape variants. One (`T14B_r2`) has a single ~16.7km corrupted coordinate jump — fixed with a general pipeline safeguard (truncate at an unambiguous outlier jump). The other (`T14B_r1`) is worse: 317 of 382 distinct `shape_pt_sequence` values appear twice, each pointing to a different location — two physical paths interleaved under one `shape_id`. Still open; not safely auto-repairable without risking false positives elsewhere.
- **#227 — turned out not to be Mexico-specific at all.** Route cards were mislabeling nearly every route "limited service." Root cause: the app's default time period is picked from the *viewer's own local clock*, with no agency-timezone awareness (tracked separately as **#245**), and a frontend bug was treating "no service in the selected period" the same as "genuinely limited service." Any agency without 24/7 service, viewed by anyone during their own local overnight hours, was affected — this has likely been live and unnoticed for a long time. Fixed.
- **#222 — hidden from production** via a new `hiddenInProduction` agency flag (visible in local dev for QA, excluded from the public build and the external agency directory) until the above is fully resolved.
- **#228 — Mexico City Metro, stays blocked.** No Metro-only GTFS source exists anywhere checked (Mobility Database, Transitland, the official `datos.cdmx.gob.mx` portal) — Mexico City's only available feed is one combined 9-agency, 301-route SEMOVI dataset with active validator errors. Getting an isolated Metro feed would mean filtering the combined dataset ourselves, not a quick feed swap.

**Takeaway:** the shape corruption and blocked Metro-only feed are genuinely Mexico/Guadalajara-specific data problems. The "limited service" bug was not — it just happened to surface there first.

---

## UK — architecturally harder than expected

Explored Gloucester/Cheltenham (Stagecoach West operates routes between them) as a starting point.

- **Source:** the Bus Open Data Service (BODS, `data.bus-data.dft.gov.uk`) is the correct, current national aggregator. No API key needed for GTFS downloads.
- **The catch:** BODS has **no per-operator download** — only whole-region zips bundling every bus operator together. The South West England file (containing Stagecoach West, `agency_id=OP735`) is 215MB compressed / ~1.4GB uncompressed, covering dozens of operators, not just the one we want.
- **Data quality itself looks good** — clean 0/1 `direction_id` across 218k trips, zero out-of-bbox stops among 43,158, dense/sane shapes, real headsigns. No Guadalajara-style corruption.
- **What it would take:** a new pipeline capability to filter a downloaded regional feed down to one `agency_id` (Atlas's `filterGtfs.ts` currently only filters by route short name / route type, nothing for agency_id). Since the download cost is fixed regardless of how many operators we keep, it'd likely make sense to extract *multiple* South West operators as separate Atlas agencies rather than just one — but each additional operator is its own data-quality unknown, and multiple agencies sharing one `feedUrl` raises a caching question (does `refresh.ts` dedupe repeated downloads of the same source file across agency entries? — not yet checked).

**Status:** not started. Good data quality, but real net-new pipeline work needed before the first agency lands.

---

## France — the easy win the UK wasn't

Checked as an alternative after the UK's bundling problem surfaced.

- **Source:** `transport.data.gouv.fr`, France's national access point, distributes GTFS **per operator/network** — TBM (Bordeaux), Le Met' (Metz), Fil Bleu (Tours), ilévia (Lille), and others each have their own dataset page with a direct single-operator GTFS zip. The only bundled exception is Île-de-France Mobilités (Paris region, ~75 operators) — not relevant to a small-city starting point.
- This matches Atlas's existing single-operator, single-feed pipeline assumption exactly — **no new filtering capability needed**, unlike the UK.
- **Le Met' (Metz)**: `https://data.lemet.fr/documents/LEMET-gtfs.zip` — 98% conformity, 100% freshness, zero validator errors. The cleanest candidate feed found across this entire investigation, Mexico and UK included.
- **Fil Bleu (Tours)**: `https://data.tours-metropole.fr/api/v2/catalog/datasets/horaires-temps-reel-gtfsrt-reseau-filbleu-tmvl/alternative_exports/filbleu_gtfszip` — noisier (~1,085 validator warnings) but no fatal errors.

**Status:** not started, but this is the recommended next country to actually process — Metz specifically, given its validator score. No architecture work needed first; can follow the same `hiddenInProduction`-gated pattern used for Mexico while validating. The plan is to launch France once a good portion of the country is covered (Metz plus at least Tours, ideally a few more), not ship a single isolated city — so any city added here should stay `hiddenInProduction` until that broader rollout is ready, not just until its own QA is done.

---

## Australia — mixed, but Queensland/Tasmania look easy

Checked as a third data point after France confirmed the UK's bundling problem isn't universal to "countries outside France."

- **No national aggregator** — confirmed fragmented, one state/territory transport authority at a time (TfNSW, PTV/Vic DoT, TransLink Qld, Transport Tasmania, Transperth WA). `data.gov.au` is just a metadata index pointing at these state portals, not a data host itself.
- **Distribution model varies by state** — this is the interesting part:
  - **NSW** and **Victoria**: bundled, UK-style. One statewide zip (NSW: `full_greater_sydney_gtfs_static_0.zip`; Victoria: a single `gtfs.zip` with internal per-mode/operator folders) covering everything at once. Would need the same agency_id-filter capability the UK needs.
  - **Queensland** and **Tasmania**: per-network, France-style. Queensland's TransLink publishes separate zips per region (SEQ, Cairns/Sunbus, Gladstone, Bowen, Rockhampton/Yeppoon, Toowoomba). Tasmania publishes separate feeds per city (Hobart, Launceston, Burnie). No filtering needed.
- **Candidate found: MetroTas Burnie** (Tasmania, pop. ~20k) — `https://files.mobilitydatabase.org/mdb-681/mdb-681-202604180143/mdb-681-202604180143.zip`. 27-28 routes, 542 stops, clean `shapes.txt`, calendar valid through Dec 2026. Technically bundles 3 small operators (Metro Tasmania, Mersey Link, Redline Coaches) — Tasmania exports per-region rather than strictly per-operator — but nowhere near NSW/Victoria's capital-city scale, comparable in spirit to Metz.
- Mobility Database has solid Australian coverage generally (TfNSW mdb-2449, TransLink SEQ mdb-668, Transperth mdb-1086, Sunbus Cairns mdb-674, MetroTas Hobart mdb-665 and Burnie mdb-681) — usable as `mdbFeedUrl` fallbacks.

**Status:** not started. Easier than the UK, harder than France — but Queensland/Tasmania specifically need zero new pipeline work, same as Metz did.

---

## Recommendation

1. **France next**, not the UK — it's the low-effort, high-confidence win the UK was originally hoped to be, and validates whether "Europe is generally easier than Mexico" holds without also taking on new pipeline architecture work. Not going live solo once processed, either — the plan is to launch France once a good portion of the country is covered (Metz + Tours + ideally more), so `hiddenInProduction` should stay on for each city until that broader rollout, not just until its own QA is done.
2. **UK and Australia's NSW/Victoria stay parked** until there's appetite for the agency_id-filter pipeline work — worth building once, since it unblocks all three at once (every England agency, plus NSW and Victoria, hit the identical regional-bundling shape).
3. **Tasmania (Burnie) is a viable next pick** if there's interest in a second country beyond France before that filter work happens — same "no new pipeline capability needed" profile as France's candidates.
4. Keep new countries **hidden from production** (`hiddenInProduction`) until each country's rollout is actually ready, same as Mexico — don't let one bad agency block or discredit an otherwise-good country's rollout, and don't ship a country as a single isolated city either.

---

[Back to Roadmap](./roadmap/ROADMAP.md) · [Agency Backlog](./AGENCY_BACKLOG.md) · [Research](./RESEARCH.md) · [Strategy](./STRATEGY.md)
