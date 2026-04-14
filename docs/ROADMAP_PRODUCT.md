# Product Roadmap

This roadmap focuses on the user experience, feed management, and the workflow of a transit professional.

## Feed & Data Management
- [ ] **Unified Feed Registry**: Centralized dashboard to view, tag, and manage all uploaded GTFS feeds and their specific agency metadata.
- [ ] **Difference Engine**: Visual preview of schedule changes during re-upload (e.g., "3 routes added, 5 frequencies adjusted").
- [ ] **Batch Deletion**: Capability to prune old feed versions and their associated catalog snapshots.

## Verification & Auditing
- [ ] **Audit Dashboard**: Re-imagined Verifier view that acts as a global queue for unreviewed route changes across all agencies.
- [ ] **Inline Verification**: Batch "Verify All" or "Flag All" actions directly from the screening table.
- [ ] **Notes & Provenance**: Rich text notes for verification decisions with service_id level provenance tracking.

## Interactive Analysis
- [ ] **Live Criteria Tuner**: Real-time browser settings for adjusting time windows, frequency buckets, and grace/violation policies.
- [ ] **Route History Timeline**: Visual ledger showing a route's evolution over multiple schedule periods (e.g., "10min → 15min shift detected in June update").

---

## Atlas NextGen — Builder Dashboard (Internal)

What we need to operate the platform and trust the data we're collecting.

### Data Health
- [ ] **Ingestion monitor**: per-agency poll success rate, vehicle count over time, last-seen timestamp — at a glance across all agencies
- [ ] **Feed health scoring**: reliability rating per agency based on vehicle count consistency, trip assignment rates, and position plausibility
- [ ] **Ghost vehicle detection**: flag vehicles reporting implausible positions (speed >200km/h, outside service area, duplicate IDs)

### Agency Management
- [ ] **Agency registry UI**: add/remove agencies, toggle route filters, view filter hit rate (what % of vehicles in feed pass the filter)
- [ ] **Key management**: track which agencies need API key renewal and when

### Data Exploration
- [ ] **Raw position playback**: replay vehicle positions for a given agency/route/time window on a map — essential for debugging trip-matching logic
- [ ] **Route coverage heatmap**: where are we actually collecting data vs. where the filter says we should be

---

## Atlas NextGen — Agency Dashboard (Customer-Facing)

What a transit agency pays to see. Designed for planners — no code, no SQL, no data science background required. See [Agency Pain Points Research](RESEARCH.md) for the problems this addresses.

### Reliability View
- [x] **Live network map**: routes coloured by current headway deviation — green (on schedule), yellow (minor gap), red (bunching or large gap)
- [x] **On-time performance by route**: headway-based OTP, not timepoint adherence — the metric that actually reflects passenger experience
- [x] **Segment-level breakdown**: where on a route does lateness originate, which stops cause dwell blowouts (requires trip-matching)
- [x] **Segment Speed Measurement**: hard empirical km/h speeds across intersections to defeat 30s polling artifact noise
- [x] **Bunching alerts**: real-time flag when headway collapses to 2× or more on a corridor

### Historical Analysis
- [ ] **OTP trends**: route reliability over time — by day of week, time of day, season
- [ ] **Worst performers**: automatically surface the routes and time windows with the worst headway consistency
- [x] **Before/after service change**: compare actual performance before and after a schedule change
- [x] **Ghost bus log**: scheduled trips with no observed vehicle — frequency by route
- [ ] **TSP Effectiveness Measurement**: comparative analysis of intersections equipped with transit signal priority vs those without

### Coverage & Equity
- [ ] **Frequent transit coverage map**: what % of the municipality lives within 10-min walk of frequent service
- [ ] **Demographic overlay**: frequency coverage vs. Census income and minority population (Title VI compliance support)
- [ ] **Peer benchmarking**: how does this agency compare to regional peers on OTP, headway reliability, and coverage

### Reporting
- [ ] **Board-ready performance summary**: auto-generated monthly report in plain language
- [ ] **Public performance portal**: embeddable, rider-facing performance dashboard for agency websites
- [ ] **NTD data export**: auto-formatted Vehicle Revenue Miles and related metrics ready for NTD submission

---

## Design Constraints (NextGen)

- **No-code first**: every view usable by a transit planner without data science training
- **Headway over schedule**: default OTP metric is headway consistency, not timepoint adherence
- **Benchmarking is opt-in**: agencies see their own data by default; peer comparison is an add-on

---

[Back to Roadmap](../ROADMAP.md)
