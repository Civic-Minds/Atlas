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

Known starting points worth checking: TransitCenter's frequent network research, individual agency "frequent network" or "high-frequency" service maps (e.g. this kind of thing has historically been published by systems like Houston METRO, King County Metro, and others — verify current ones rather than assuming), and any GTFS-based frequent-network tools that already publish their own methodology.

### Examples already surfaced (verify and expand, don't just trust these)

- **TTC (Toronto)** — has a "10-Minute Network," still shown on the official system map as of this writing. Exact current threshold/hours not yet pulled from a primary source — confirm directly against ttc.ca rather than secondary commentary.
- **Boise, ID (Valley Regional Transit)** — reported as 15 min headway during peak hours only, roughly 6-9am and 3-6pm. Peak-only, not all-day — a real example of the "dip allowed outside peak" pattern from the open design question below. Verify against VRT's own published materials before treating this as confirmed.

## Open design question this research should settle

Atlas's own `TIME_PERIODS` already splits the day into amPeak / midday / pmPeak / evening / late / overnight (`shared/config.ts`). Once the survey above is done, decide:

- Does "frequent" require the threshold to hold in **every** daytime period, or can it dip in one (e.g. midday) as long as peaks and evening hold?
- Is the threshold agency-relative (a route is frequent if it's in that agency's own top tier) or an absolute number Atlas applies everywhere?

## Not yet decided

- The specific headway threshold Atlas would use
- Whether this ships as its own destination/tool (mirroring Night Service) or a different UI treatment
- Whether "Explore" becomes a real grouping once there are two standalone tools (Night Service + this) instead of one — see conversation history, not written up separately yet
