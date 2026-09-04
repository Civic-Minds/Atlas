# Roadmap experiments

Ideas we're kicking around — not committed roadmap items, no promise any of it ships. Written down so they're not forgotten, not because they're planned.

For experiments already being implemented or QA-validated, see the [implementation experiment index](../../EXPERIMENTS.md).

- **[Factbook](./experiments/FACTBOOK.md)**: turning the dataset into shareable data-driven stories and "did you know" facts.
- **In-app Report Cards**: a one-click frequency report card per route/agency, inside the app itself, for riders and planners. The QA version of this idea already shipped as a CLI tool (`npm run route-report`) — this would be the in-app, public-facing version, not yet built.
- **Intercity connections layer**: municipal networks currently render as isolated islands with nothing showing how they connect to each other. A sparse overlay of intercity bus/rail corridors (Greyhound, FlixBus, Amtrak Thruway) — just route existence, not full headway precision, since most of these run a few times a day — would show the connective tissue between agencies. Data sourcing is the open question: no clean GTFS for most of these operators, likely scrape/curate manually. Would prototype on beta, one corridor first, before deciding if it's worth the data-maintenance cost.
- **Trip-time-over-years comparison**: show how long a given trip actually takes now vs. in past years, using archived GTFS. Only fair for routes whose stops and alignment haven't changed between the two snapshots being compared — a rerouted or shortened line would make the "faster/slower" claim meaningless, so this needs a same-route stability check (shape + stop sequence match) before showing any comparison, and no such shape-diff tool exists yet (only a stop-diff console log, not persisted). Rail is the natural starting mode — alignments change far less often than bus. Blocked less on the idea and more on data depth: most agencies only have ~10 weeks of retained history (native snapshotting started 2026-06-25), and the handful of agencies with years of backfilled history are mostly small bus systems, not rail. Revisit once either more time has passed or a rail agency gets a manual historical backfill.

---

[Back to Roadmap](./ROADMAP.md)
