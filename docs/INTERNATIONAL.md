# International Expansion

Research and planning for taking Atlas coverage beyond Canada/US. Half roadmap, half research log — capturing what's actually been found country by country, since that reasoning doesn't fit the terse todo format of [`AGENCY_BACKLOG.md`](AGENCY_BACKLOG.md).

---

## Why expand internationally

Atlas's coverage has been exclusively Canada/US to date. Mexico (Mi Transporte / Guadalajara) was added as the first test of coverage outside that footprint. The open question this doc tracks: how much of what we learned from Mexico's messy feed is a *Mexico* problem versus a *first-country-of-any-kind* problem — and which country should come next.

---

## Mexico — first country, currently hidden from production

Mi Transporte (Guadalajara) was added, then found to have real, unrelated data-quality issues once put under scrutiny:

- **[#219](https://github.com/Civic-Minds/Atlas/issues/219) / [#244](https://github.com/Civic-Minds/Atlas/issues/244) — corrupted shape data.** Route T14B has two broken shape variants. One (`T14B_r2`) has a single ~16.7km corrupted coordinate jump — fixed with a general pipeline safeguard (truncate at an unambiguous outlier jump). The other (`T14B_r1`) is worse: 317 of 382 distinct `shape_pt_sequence` values appear twice, each pointing to a different location — two physical paths interleaved under one `shape_id`. Still open; not safely auto-repairable without risking false positives elsewhere.
- **[#227](https://github.com/Civic-Minds/Atlas/issues/227) — turned out not to be Mexico-specific at all.** Route cards were mislabeling nearly every route "limited service." Root cause: the app's default time period is picked from the *viewer's own local clock*, with no agency-timezone awareness (tracked separately as **[#245](https://github.com/Civic-Minds/Atlas/issues/245)**), and a frontend bug was treating "no service in the selected period" the same as "genuinely limited service." Any agency without 24/7 service, viewed by anyone during their own local overnight hours, was affected — this has likely been live and unnoticed for a long time. Fixed.
- **[#222](https://github.com/Civic-Minds/Atlas/issues/222) — hidden from production** via a new `hiddenInProduction` agency flag (visible in local dev for QA, excluded from the public build and the external agency directory) until the above is fully resolved.
- **[#228](https://github.com/Civic-Minds/Atlas/issues/228) — Mexico City Metro, stays blocked.** No Metro-only GTFS source exists anywhere checked (Mobility Database, Transitland, the official `datos.cdmx.gob.mx` portal) — Mexico City's only available feed is one combined 9-agency, 301-route SEMOVI dataset with active validator errors. Getting an isolated Metro feed would mean filtering the combined dataset ourselves, not a quick feed swap.

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

## France — per-operator feeds, mostly clean once the detector was fixed

Checked as an alternative after the UK's bundling problem surfaced.

- **Source:** `transport.data.gouv.fr`, France's national access point, distributes GTFS **per operator/network** — TBM (Bordeaux), Le Met' (Metz), Fil Bleu (Tours), ilévia (Lille), STAR (Rennes), and others each have their own dataset page with a direct single-operator GTFS zip. The only bundled exception is Île-de-France Mobilités (Paris region, ~75 operators) — not relevant to a small-city starting point.
- This matches Atlas's existing single-operator, single-feed pipeline assumption exactly — **no new filtering capability needed**, unlike the UK.
- **Le Met' (Metz)**: `https://data.lemet.fr/documents/LEMET-gtfs.zip` — 98% conformity, 100% freshness, zero validator errors, zero shape anomalies. Processed and validated.
- **STAR (Rennes)**: `https://eu.ftp.opendatasoft.com/star/gtfs/GTFS_STAR_BUS_METRO_EN_COURS.zip` — a second genuinely promising candidate. 99.4% of shapes clean (167/170); the other 3 are either already auto-fixed by existing truncation logic or a single real case flagged via [#246](https://github.com/Civic-Minds/Atlas/issues/246) for manual review. Headway-mismatch flags all look like the familiar benign long-peri-urban-branch pattern. Not processed for real yet, config only.

**A real shape-corruption pattern exists — [#246](https://github.com/Civic-Minds/Atlas/issues/246) — but it's much rarer than first measured, and now auto-repairs.** Some French shapes genuinely merge two physical sub-paths into one `shape_id` with unique (non-duplicate) `shape_pt_sequence` numbers whose order zigzags between both — distinct from Guadalajara's duplicate-sequence corruption (#219/#244). A greedy-nearest-neighbor and a cheapest-insertion repair were both tried first against real data and made it worse, not better; the fix that actually worked excises the interleaved detour and bridges the gap directly, self-verified before shipping — validated against all 17 known real cases across Nancy, Bordeaux, and Rennes. Likely mechanism: French law (LOM) requires transit data published as NeTEx, with GTFS produced by *converting* it — commonly via Chouette, the national open-source NeTEx↔GTFS converter — and NeTEx's journey-pattern/shared-route-section model doesn't map cleanly to GTFS's "one `shape_id` = one continuous line" assumption. Not a confirmed root cause with a citation, but a well-supported working theory.

**Important correction:** the detection check's first version flagged any implausibly-long segment relative to a shape's median point spacing, which produced heavy false positives on densely-sampled feeds — a long-but-straight segment across a bridge or open area can be 8x+ a tiny median (Rennes: ~11m) without being corrupt at all. Verified directly by comparing turn angles: real corruption (Nancy) showed a ~174° direction reversal at the flagged point; every false positive (Rennes) stayed under 34°. Fixed by also requiring a sharp bearing reversal (>100°), not just segment length. Corrected numbers, six cities checked:

| City | First measured | Corrected | Now |
|---|---|---|---|
| Le Met' (Metz) | Clean | Clean — 0% | Clean |
| Fil Bleu (Tours) | 26% | **0%** | Clean |
| Réseau Stan (Nancy) | 30% | **6%** (5/82) | All 5 fixed (3 auto-repaired generally, 2 via a narrowly-scoped known-point exception — see below) |
| TBM (Bordeaux) | 72% | **3%** (11/429) | All 11 auto-repaired |
| STAR (Rennes) | 88% | **0.6%** (1/170) | Fixed |
| ilévia (Lille) | — | No `shapes.txt` in the feed at all (unrelated gap — same as CTS Strasbourg, Pont-à-Mousson, and TaM Montpellier: the agency's own export never included shape geometry, nothing to repair). **Blocked** — see [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) § Missing Agencies. | — |
| TaM (Montpellier) | — | **Blocked 2026-07-19.** Full official feed + urbain companion have zero shapes (dry-run: stops only). Suburbain companion has shapes but is suburban-bus-only — not a real Montpellier network. Same permanent-until-upstream gap as Lille/Strasbourg. | — |

**A second, narrower gap surfaced after the general repair shipped: two more Nancy shapes (routes T2 and Corol) had a single *isolated* misplaced point** — no second reversal nearby, so the general detector's clustering requirement (2+ reversals close together) correctly leaves it alone; a lone sharp reversal is exactly what a genuine street-corner turn or terminus loop looks like too. A general heuristic (only flag an isolated reversal if bridging past it saves enough path distance) was tried and validated against Nancy's two real cases (33-88% distance saved), then checked against live Canada/US agencies before trusting it broadly — and found a real TTC route 101 terminus loop (into Downsview Park/Finch West stations) at 30.6% savings, uncomfortably close to the real threshold. Rejected as a general rule; these two specific Nancy shapes are now fixed by an explicit shape_id + coordinate match instead, not a heuristic applied to every feed.

**Takeaway:** the original "France is the easy win" thesis holds up much better than it looked mid-investigation — Metz and Rennes are both genuinely clean or near-clean, Tours has zero real shape corruption, and even Bordeaux/Nancy's real issue rates are low single digits, not the double-digit-to-majority figures first reported. The false-positive detector briefly made this look like a systemic France-wide problem; it wasn't. And with the repair mechanism now in place (validated against live Canada/US feeds, not just French ones), every known shape-corruption case in the France candidate set is resolved.

**Status:** ~142 French agencies are now in the registry as candidates (`hiddenInProduction` + `pmtilesPending`), all dry-run validated with route geometry near the claimed city — covering every métropole région including Corsica gaps and a second mid-size sweep (2026-07-19). Still **zero** production-visible French agencies; nothing launched to live R2 without an explicit country-launch decision. Blocked / rejected this cycle: Montpellier, Lille, Strasbourg, Thionville, Arras, Bastia (stops-only), plus several wrong-geo feed mismatches (e.g. Astuce feed attached to Saint-Quentin). The plan remains: launch France once coverage is broad enough, not city-by-city.

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

## Belgium — France's model, four operators, TEC as the Nancy analog

Checked as a candidate second European country once France's shape-corruption question was resolved.

- **No single national aggregator, but two useful layers:** `transportdata.be` is Belgium's official EU-mandated national access point (analogous to France's `transport.data.gouv.fr`); `gtfs.be` is a third-party (iRail/hello.irail.be) daily-regenerated combined feed for the whole country, useful as a cross-check but not the primary source. Four operators cover the whole country by design — no fragmented patchwork like the UK/Australia's states:
  - **STIB/MIVB** (Brussels — bus, tram, metro): own portal (`data.stib-mivb.brussels`), **CC BY 4.0**, daily updates.
  - **De Lijn** (Flanders — bus, tram): own portal requires a contact-form request for access; the `transportdata.be`/Mobility Database mirror (`mdb-684`, `http://gtfs.irail.be/de-lijn/de_lijn-gtfs.zip`) sidesteps that friction. 7 warnings, 0 errors, ~2,089 routes, daily.
  - **TEC** (Wallonia — bus, light rail in Charleroi): `http://opendata.tec-wl.be/Current%20GTFS/TEC-GTFS.zip`, also `mdb-1212`. 0 errors, 12 warnings, 916 routes, includes shapes/feed_info, daily-fresh.
  - **SNCB/NMBS** (national rail): `https://gtfs.irail.be/nmbs/gtfs/latest.zip`, also `mdb-686`. 0 errors, 1,755 routes, daily — largest and most complex of the four (multi-country coverage into Luxembourg/France/Germany).
- **This matches France's per-operator model** — no new agency_id-filter pipeline work needed, same as France and unlike the UK/NSW/Victoria.
- **No confirmed shape-corruption risk found** — no public validator report or vendor documentation surfaced anything matching the French NeTEx-conversion pattern for any of the four operators; all four feeds' latest validator runs show clean shapes with only minor warnings. Not positively ruled out either (the underlying GTFS-producing software per operator isn't confirmed), so the same defensive shape-check should run on any Belgian feed by default rather than assuming safety.
- **Quirk to expect:** bilingual (Dutch/French, sometimes German) route and stop names, especially in Brussels and at the national-rail level, since Belgium is officially multilingual.

**Recommendation:** **TEC first**, not STIB — same "clean, mid-size, one clear owner" profile that made Nancy a good France starting point, rather than jumping straight to the capital's metro-scale feed. Suggested order: **TEC → STIB → De Lijn → SNCB**, holding STIB for a second step (well-documented and clean, but Brussels-scale) and De Lijn behind SNCB-adjacent complexity concerns (access friction, not data quality). SNCB last regardless of cleanliness, matching how France holds its own biggest/messiest feed for later.

---

## Spain — regional consortium model, Metro Bilbao as the cleanest first candidate

Checked as a second candidate alongside Belgium.

- **No single national aggregator**, but Spain's EU-mandated national access point (`nap.transportes.gob.es`) plays the same discovery/verification role as France's and Belgium's — check it first for any future candidate before going straight to an operator's own portal.
- **Madrid uses a genuinely clean consortium pattern:** CRTM (the regional transport consortium) publishes Metro, Metro Ligero (light rail), EMT urban buses, and Cercanías as **separate** GTFS datasets from `datos.crtm.es`, not one bundled mega-feed — lower collision risk than a merged approach, and a good template if Atlas ever needs to reason about a regional consortium. Explicit open-data license (attribution + update-date preservation required, commercial reuse permitted).
- **EMT Madrid** — one of the cleanest feeds found in this survey: Mobility Database mirror (`mdb-793`) refreshed **daily**, 0 errors / 2 warnings, 237 routes, includes shapes/headsigns/frequencies.
- **Metro Bilbao** — hosted via the Basque Government's "Moveuskadi" geodata service, explicitly **CC BY 4.0** (the only unambiguous, named open license found in this survey, vs. bespoke reuse policies elsewhere), small system (2 lines), GTFS-RT companion verified active within the last 6 months.
- **TMB (Barcelona)** — publishes GTFS via its own developer portal, mirrored on transit.land since 2010, but Barcelona's Rodalies-branded rail spans two *different* operators (Renfe on some lines, FGC on others) alongside TMB/AMB/TRAM all serving overlapping geography — real risk of agency_id/route_id collisions from a naive pull, unlike CRTM's cleaner per-mode separation.
- **Renfe / Cercanías (national rail)** — feed is national-scope, not city-scope (637 routes spanning Spain/France/Portugal in one dataset); any single-city pull would need a regional slice extracted, not a direct ingest.
- **TUSSAM Sevilla — negative finding.** No officially published, actively-maintained GTFS feed exists; what's available is community/research-scraped data, not authoritative. Not viable as a candidate right now.
- **Shape-corruption risk flag:** no confirmed Spanish equivalent of the French NeTEx-conversion bug, but several major Spanish portals (including CRTM) run on Esri ArcGIS Online, whose own "Generate GTFS Shapes" tooling has documented defects (silent fallback to straight-line shapes when road-network snapping fails) — any CRTM-hosted feed deserves the same defensive shape-check as everything else before trusting it.

**Recommendation:** **Metro Bilbao first** — small, unambiguous CC BY 4.0 license, actively maintained, single operator, same profile as Nancy/TEC. **EMT Madrid second** — best raw feed quality measured in this survey (daily refresh, 0 errors), but bigger scale, better suited once the pipeline is proven small-first. Avoid Barcelona initially (overlapping-operator collision risk) and Sevilla entirely (no reliable feed).

---

## Recommendation

1. **France next**, not the UK — it's the low-effort, high-confidence win the UK was originally hoped to be, and validates whether "Europe is generally easier than Mexico" holds without also taking on new pipeline architecture work. Not going live solo once processed, either — the plan is to launch France once a good portion of the country is covered (Metz + Tours + ideally more), so `hiddenInProduction` should stay on for each city until that broader rollout, not just until its own QA is done.
2. **Belgium and Spain are both viable second-Europe candidates, same per-operator/consortium profile as France** — no new agency_id-filter pipeline work needed for either. TEC (Wallonia) and Metro Bilbao are each the "Nancy" of their country: clean, mid-size, single owner, unambiguous license. Neither has been processed yet — research only so far.
3. **UK and Australia's NSW/Victoria stay parked** until there's appetite for the agency_id-filter pipeline work — worth building once, since it unblocks all three at once (every England agency, plus NSW and Victoria, hit the identical regional-bundling shape).
4. **Tasmania (Burnie) is a viable next pick** if there's interest in a country beyond France before that filter work happens — same "no new pipeline capability needed" profile as France's candidates.
5. Keep new countries **hidden from production** (`hiddenInProduction`) until each country's rollout is actually ready, same as Mexico — don't let one bad agency block or discredit an otherwise-good country's rollout, and don't ship a country as a single isolated city either.

---

[Back to Roadmap](./roadmap/ROADMAP.md) · [Agency Backlog](./AGENCY_BACKLOG.md) · [Research](./RESEARCH.md) · [Strategy](./STRATEGY.md)
