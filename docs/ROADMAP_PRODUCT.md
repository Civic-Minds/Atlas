# Product Roadmap

User experience, agency-facing features, and the workflow of a transit professional.

---

## Map Apps (Current Focus)

| App | Status | Question it answers |
|-----|--------|---------------------|
| **Frequency Map** | Live | Where is service frequent or infrequent? |
| **Corridors** | Live (v2.3.0) | What runs directly between these two stations? |
| **History** | Planned | How did service change across schedule periods? |

**Bar for a new app:** needs the map + Atlas-processed data, and answers a question the Frequency Map can't answer cleanly. Otherwise it's a panel, toggle, or filter.

---

## Live Data Layer (Next)

- [ ] **Live vehicle map**: extend GTFS-RT archiver Worker to write `{slug}/vehicles/latest.json` snapshots to R2; frontend polls every 30s
- [ ] **Schedule adherence panel**: per-stop comparison of scheduled vs. actual headway — start with Hamilton B-Line and Burlington Route 1
- [ ] **Historical drift analysis**: combine archived R2 snapshots with on-demand TripUpdates to surface patterns over time (e.g. "always 5 min late on Tuesdays at this stop")

---

## Agency Intelligence (Future)

### Reliability View
- [ ] **Live network map**: routes coloured by current headway deviation — green (on schedule), yellow (minor gap), red (bunching or large gap)
- [ ] **Headway-based OTP**: actual headway consistency per route, not timepoint adherence — the metric that reflects passenger experience
- [ ] **Segment-level breakdown**: where on a route does lateness originate, which stops cause dwell blowouts
- [ ] **Bunching alerts**: real-time flag when headway collapses to 2× or more on a corridor

### Historical Analysis
- [ ] **OTP trends**: route reliability by day of week, time of day, season
- [ ] **Worst performers**: automatically surface routes and time windows with worst headway consistency
- [ ] **Before/after service change**: compare actual performance before and after a schedule change
- [ ] **Ghost bus log**: scheduled trips with no observed vehicle — frequency by route

### Coverage & Equity
- [ ] **Frequent transit coverage map**: what % of the municipality is within 10-min walk of frequent service
- [ ] **Demographic overlay**: frequency coverage vs. Census income and minority population (Title VI compliance support)
- [ ] **Peer benchmarking**: how does this agency compare to regional peers on OTP, headway reliability, and coverage

### Reporting
- [ ] **Board-ready performance summary**: auto-generated monthly report in plain language
- [ ] **Public performance portal**: embeddable, rider-facing performance dashboard for agency websites
- [ ] **NTD data export**: auto-formatted Vehicle Revenue Miles and related metrics ready for NTD submission

---

## Design Constraints

- **No-code first**: every view usable by a transit planner without data science training
- **Headway over schedule**: default OTP metric is headway consistency, not timepoint adherence
- **Benchmarking is opt-in**: agencies see their own data by default; peer comparison is an add-on

---

[Back to Roadmap](../ROADMAP.md)
