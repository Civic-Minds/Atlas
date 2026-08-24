# Roadmap experiments

Ideas we're kicking around — not committed roadmap items, no promise any of it ships. Written down so they're not forgotten, not because they're planned.

For experiments already being implemented or QA-validated, see the [implementation experiment index](../../EXPERIMENTS.md).

- **[Factbook](./experiments/FACTBOOK.md)**: turning the dataset into shareable data-driven stories and "did you know" facts.
- **In-app Report Cards**: a one-click frequency report card per route/agency, inside the app itself, for riders and planners. The QA version of this idea already shipped as a CLI tool (`npm run route-report`) — this would be the in-app, public-facing version, not yet built.
- **Intercity connections layer**: municipal networks currently render as isolated islands with nothing showing how they connect to each other. A sparse overlay of intercity bus/rail corridors (Greyhound, FlixBus, Amtrak Thruway) — just route existence, not full headway precision, since most of these run a few times a day — would show the connective tissue between agencies. Data sourcing is the open question: no clean GTFS for most of these operators, likely scrape/curate manually. Would prototype on beta, one corridor first, before deciding if it's worth the data-maintenance cost.

---

[Back to Roadmap](./ROADMAP.md)
