# Atlas — Improvements

Actionable improvements from an agency manager's perspective. Prioritized by operational impact.
Informed by [RESEARCH.md](RESEARCH.md) pain points and live platform review (April 2026).

---

## 🔴 P0 — High Impact / Near-Term (Completed)

- [x] **Exportable Reports** — PDF + CSV export for corridor performance, OTP, and reliability data. Board members don't log in. They need attachments they can forward.
- [x] **Historical Trend Lines** — OTP and AHW reliability over weeks/months, per route and per corridor. "Show me that Route 15 improved after the March schedule change." Without this, every metric is a snapshot with no story.
- [x] **Functional Analysis Engines** — Predict and Simulator are now fully-featured engines (Gravity-based demand forecasting, stop consolidation impact). Successfully transitioned from "empty shells" to strategic research modules.
- [x] **Onboarding Flow** — The "No feeds stored" empty state is a dead end. Guide new users: "Upload your GTFS zip or connect a GTFS-RT feed URL." First 30 seconds determine whether someone keeps using the tool.
- [x] **Professional Terminology** — Replace internal jargon ("Ouija server", "Big Fish Experiment", "Establishing Pulse") with standard transit/engineering language ("GTFS-RT Gateway", "Full Fleet Experiment", "Connecting..."). Consider a glossary page.

---

## 🟡 P1 — Core Intelligence

- [x] **Alert Thresholds** — Configurable per-route/corridor notifications via CRUD API. "Notify me when reliability drops below 70%." Tracks history and supports cooldowns. Ready for Notion/Slack integration.
- [x] **Bunching Detection (Real-Time)** — Flag when 2+ vehicles on the same route are < 60 seconds apart. The #1 rider complaint and #1 question from elected officials. Already in NextGen Phase 2 checklist — needs to be prioritized.
- [x] **Ghost Bus Detection** — Scheduled trips with no observed vehicle. Show frequency by route. Already in NextGen Phase 2 — surface it in the UI with a count per agency.
- [x] **Schedule Adherence Breakdown** — Distribution of early/on-time/late, not just average delay. "40% on-time, 35% late, 25% early" tells a completely different story than a mean of -12 seconds.
- [x] **Feed Health Scoring** — Per-agency reliability grade based on vehicle count consistency, trip assignment rate, and position plausibility. Composite score (0-100) surfaced in the Pulse Dashboard.
- [x] **Enterprise Sync Detail** — Detailed metrics in the dashboard (Status/Scores/Throttling) instead of a generic "Synced" label.

---

## 🚀 Strategic Foresight (The Next Frontier)
Beyond the current roadmap, professional transit intelligence requires addressing the **"Why"** and the **"Context"**:

- **GTFS-RT Service Alerts Integration** — Currently, we detect 'Ghosts' (missing trips), but we don't know *why*. Polling the Alerts feed allows distinguishing between 'Technical Failure' and 'Planned Detour/Cancellation.'
- **Historical Performance Baselines** — Managers need to know: "Is 88% OTP good for a rainy Tuesday?" We should compare real-time data against "Typical" Tuesday AM averages to identify abnormal degradation.
- **Corridor Meta-Grouping** — Many agencies manage 'Trunk' lines (e.g., NYC's M15 + M15-SBS). We should support aggregation across multiple routes into a single 'Corridor Performance' score.
- **Automated Intelligence Briefs** — An AI-summarized weekly brief for board members: "Route 10 reliability improved 5% after the stop consolidation." High-impact retention for busy execs.

---

## 🟢 P2 — Depth & Analysis

- [x] **Segment-Level Breakdown** — Where on a route does lateness originate? Full implementation of segment travel time analysis (A->B). Surfaced in the Intelligence Hub "MRI" dashboard for bottleneck detection.
- [x] **Dwell Time Analysis** — How long buses sit at each stop. Stateful transition detection for tracking AT_STOP duration. Identifies fare-payment and boarding friction in the Intelligence Hub.
- [ ] **Detour/Reroute Awareness** — Flag when vehicles deviate from their GTFS shape. Construction detours wreck OTP metrics unfairly. Let managers annotate "detour in effect" to exclude from scoring.
- [ ] **Before/After Service Change** — Compare actual performance across a schedule change date. "Did the March frequency increase actually improve reliability?" Already in Product Roadmap — needs implementation path.
- [ ] **Passenger Load Context** — Even estimated ridership data from APC or fare systems. A gap on a route carrying 200 riders/trip is worse than a gap carrying 20. Changes how you prioritize.
- [ ] **Speed Profiles** — Average speed by segment, time of day. Shows where infrastructure (signal priority, bus lanes, queue jumps) would have the most impact. Planners use this for capital requests.
- [ ] **Weather Correlation** — Overlay weather data to explain performance drops. "Reliability dropped to 45% on Jan 15 — that was the ice storm." Prevents false conclusions from trend data.

---

## 🔵 P3 — Enterprise & Advocacy

- [ ] **Monthly Intelligence Briefs** — Auto-generated plain-language summary: "Route 15 reliability improved 8% this month. 3 corridors exceeded target." Push to Notion + email. The killer retention feature.
- [ ] **Public Performance Portal** — Embeddable, rider-facing dashboard for agency websites. Agencies under budget pressure need to *show* they're performing. Already in Product Roadmap.
- [ ] **NTD Data Export** — Auto-formatted Vehicle Revenue Miles and related metrics for National Transit Database submission. Currently a manual nightmare for every agency. Concrete budget justification for the tool.
- [ ] **Peer Benchmarking** — "How does our M15 compare to Chicago's #79?" Opt-in, anonymized by default. Same corridors, similar density — show me where I can learn.
- [ ] **Equity / Title VI Overlay** — Frequent service coverage vs. Census demographics. Mandated by federal law, poorly tooled at most agencies. GTHA pipeline already does walkshed + population — extend with demographic data.
- [ ] **Transfer Point Analysis** — Are connections being made? How often do riders miss timed transfers? Requires matching across routes at designated transfer locations.
- [ ] **Operator Run Performance** — Anonymized performance by operator run/block. Not for punishment — for identifying training needs and schedule feasibility. Sensitive data, needs careful access controls.

---

## 💡 UX Quick Wins

- [ ] Tooltips on map vehicle markers showing match confidence and delay reason
- [ ] "Last updated X seconds ago" heartbeat on every data view (not just Pulse)
- [ ] Keyboard shortcuts for power users (agency planners live in these tools 8hrs/day)
- [ ] Dark mode persistence across sessions (currently resets)
- [ ] Mobile-responsive layout for field supervisors checking the map on tablets
- [ ] Loading skeletons instead of spinners — the content should feel instant

---

## Cross-References

Many items here overlap with existing roadmap docs. Canonical references:

| Item | Also In |
|:---|:---|
| Bunching detection | [ROADMAP_NEXTGEN.md](ROADMAP_NEXTGEN.md) Phase 2, [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Reliability View |
| Ghost bus detection | [ROADMAP_NEXTGEN.md](ROADMAP_NEXTGEN.md) Phase 2, [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Historical Analysis |
| Feed health scoring | [ROADMAP_NEXTGEN.md](ROADMAP_NEXTGEN.md) Phase 2, [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Data Health |
| Equity / Title VI | [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Coverage & Equity, [RESEARCH.md](RESEARCH.md) §6 |
| NTD export | [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Reporting, [RESEARCH.md](RESEARCH.md) §2 |
| Board-ready reports | [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Reporting, [RESEARCH.md](RESEARCH.md) §8 |
| Peer benchmarking | [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Coverage & Equity |
| Segment-level breakdown | [ROADMAP_PRODUCT.md](ROADMAP_PRODUCT.md) Reliability View |

---

*Last updated: April 1, 2026*
