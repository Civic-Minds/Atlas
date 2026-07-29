# Frequent Network Criteria

**Status:** Proposed / exploratory — research brief, no design decided yet

Atlas could add a "Frequent" tool alongside Night Service: routes that hold a strong headway across the whole daytime service span, not just at one good moment. Same shape as Night Service's rule (a departure at least every N minutes across a fixed window, no gap at either edge) but for daytime instead of midnight-6am.

## Product question

> Which routes actually run frequently all day, not just at rush hour?

A route that's every 8 minutes at AM peak and every 40 minutes at midday shouldn't read as "frequent" just because its best number looks good. This is the same failure mode #299 (`headwayByPeriodSustained`) was built to catch, applied to a user-facing filter instead of a diagnostic flag.

## What needs research before a threshold gets picked

There's no single accepted industry number. Transit agencies and advocacy groups that publish their own "frequent network" maps each define it differently — headway threshold, which hours count, and whether weekends are included all vary. Before Atlas invents its own definition, worth surveying what's actually out there:

- What headway threshold does each agency/org use (10 min? 15 min? "every 12 min or better"?)
- What time span counts as "all day" for each — does it start at AM peak or earlier/later? Does it end at evening, or extend later?
- Does the definition require the threshold to hold uniformly across the whole span, or tolerate a dip in a weaker period (e.g. midday) as long as peaks hold?
- Weekday-only, or does their frequent network also require weekend frequency?
- Source each definition — agency name, the specific document/map it comes from, and the date, since these get revised.

## Survey findings

Collected 2026-07-29 from agency system maps / published frequent-network materials (Ryan + session notes). Where an agency publishes multiple tiers, **most-frequent tier** is treated as their "frequent" definition.

### Published definitions

| Agency | Label | Threshold | Hours / span | Days | Notes |
|--------|-------|-----------|--------------|------|-------|
| **TTC (Toronto)** | 10-Minute Network | ≤10 min | 6am–1am (8am start Sun) | 7 days | Hard max across full span; map + route pages |
| **STM (Montréal)** | Lignes fréquentes | usually 2–12 min | All-day **or** peak-only (two lists) | Mon–Fri | Soft ("habituellement"); peak tier is first-class |
| **Metro Vancouver** | Frequent Transit Network | ≤15 min | corridors, region-wide | (not specified in short def) | Corridor-based, not per-route branding only |
| **Winnipeg** | Primary Transit Network | peak 4–15; off-peak 5–20; night/weekend 10–30 | varies by period | includes night/weekend (weaker) | Period-banded, not one number |
| **Edmonton** | Frequent Route | ≤15 min | "most times of the day" | (not specified) | Soft span language |
| **Victoria (BC Transit)** | Rapid / Frequent | ≤15 min | Rapid: 7am–10pm; Frequent: 7am–7pm | Rapid: 7 days; Frequent: Mon–Fri | Two products, same headway, different span |
| **King County Metro (Seattle)** | Frequent all-day route | ≤15 min | until 6pm | Mon–Fri | Ends early evening; weekday only |
| **LA Metro** | (frequent map) | ≤15 min | 6am–6pm | (map scope; rail + those buses) | All rail + qualifying buses |
| **Boise (VRT)** | (frequent) | ≤15 min | peak ~6–9am, 3–6pm | (peak framing) | Peak-only — not all-day |
| **UTA / SLC** | UVX / OGX / MVX / Frequent bus | UVX·OGX BRT 6–15; MVX BRT 15–30; Frequent bus 15–60 | product-specific | UVX Mon–Sat noted | Tiered BRT + wide "frequent bus" band |
| **Miami-Dade** | map tiers | most-frequent: ≤10; also shows ≤15 | (map) | (map) | Map has both 10 and 15 bands; top tier = ≤10 |
| **MBTA (Boston)** | Frequent Bus Routes | ≤15 min | (expanding network) | (not in short blurb) | "Buses that arrive every 15 minutes or less" |

### No published frequent-network definition found

Halifax · Calgary · Kingston · Sound Transit · SDMTS (San Diego)

### Patterns

- **15 min** is the modal North American "frequent" number (Metro Van, Edmonton, Victoria, KCM, LA, MBTA, Boise peak).
- **10 min** is the stricter / top tier (TTC, Miami top band; STM effectively ≤12).
- **All-day** means different things: TTC 6am–1am; LA/KCM end by 6pm; Victoria Rapid to 10pm; Boise peak-only.
- **Weekends** often weaker or absent (STM weekdays; KCM Mon–Fri; Victoria Frequent Mon–Fri; TTC includes weekends with Sunday later start).
- Several systems **explicitly allow weaker off-peak** (Winnipeg bands, STM peak-only list, Boise peak-only) rather than one uniform rule.

## Decision (2026-07-29)

**≤15 min headway, sustained 7am–7pm, weekday. No gap at either edge of the window (same boundary rule as Night Service).**

Matches Victoria (BC Transit)'s own "Frequent" product exactly (7am–7pm, weekday, from the survey table above) — a directly-precedented choice, not an arbitrary pick. Rationale for each piece:

- **≤15 min**: the modal real-world number (6 of 12 surveyed systems), and already an existing tier boundary in Atlas's own `HEADWAY_TIERS` (`shared/config.ts`) — no new number invented. ≤10 min (TTC/Miami-style) is a plausible stricter second tier later, not v1.
- **7am–7pm, not peak-only**: rejects the Boise/STM-peak-list pattern (real, but answers "is it good at rush hour," not "does it run frequently all day"). Matches Atlas's own product question.
- **Weekday-only**: most surveyed definitions are weekday-only or weaker on weekends (STM, KCM, Victoria Frequent all weekday; TTC is the exception).
- **7am–7pm doesn't align to Atlas's existing `TIME_PERIODS` boundaries** (amPeak starts 6am, pmPeak ends 7pm exactly, so 7am cuts into amPeak). This is a standalone window, same shape as Night Service's own independent window (`NIGHT_SERVICE_WINDOW_START_MIN`/`END_MIN` in `pipeline/headway-utils.ts`) rather than reusing the amPeak/midday/pmPeak split.

## Not yet decided

- Whether this ships as its own destination/tool (mirroring Night Service) or a different UI treatment
- Whether "Explore" becomes a real grouping once there are two standalone tools (Night Service + this) instead of one — see conversation history, not written up separately yet
- A stricter ≤10 min sub-tier, if wanted later
