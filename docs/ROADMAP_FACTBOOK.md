# Atlas Factbook

**Status**: Proposed / exploratory

A system for discovering, computing, and surfacing interesting, data-driven findings from Atlas.

The goal is to turn the rich, normalized dataset (headways, tiers, history snapshots, corridors, etc.) into shareable insights, "did you know" facts, before/after stories, and comparative analysis — in the spirit of data storytellers who highlight real transit patterns and changes.

## Vision
Atlas doesn't just show the map. It also tells the stories the data contains:
- How service has actually changed over years
- Where frequency is surprisingly good (or bad)
- Hidden high-frequency corridors
- Peer comparisons and outliers across 160+ agencies
- Time-of-day realities

These can live inside the app (for planners and users), as exports, and as source material for public content.

## Why Atlas Data Is Strong for This
- 164 agencies with consistent, processed headway/tier analysis (not raw GTFS)
- Multi-year history snapshots (headway + geometry per period)
- Corridors showing combined frequency from overlapping routes
- Per-period (AM / midday / PM / evening) breakdowns
- Short-turn awareness, bunching signals, and other derived metrics
- Auditable from public GTFS feeds
- Growing live adherence data
- Regional coverage across Canada and the US

## Example Fact Categories
- **Frequency reality checks**: "% of an agency's routes that are actually ≤15 min all day" or "midday frequent service share vs. peak-only".
- **Service change stories**: "Largest improvements and regressions" pulled from history archives (e.g. a route that went from 40 min to 10 min, or vice versa).
- **Time-of-day gaps**: Evening or late-night service deserts, even on routes that look frequent during the day.
- **Corridor gems**: Segments that deliver rapid-transit-like combined headways because multiple routes overlap.
- **Peer & regional comparisons**: How one agency or region stacks up against similar peers (by size, population served, mode mix).
- **Outliers & anomalies**: Unusual spans, extreme bunching, routes that no longer exist under their historical short name, dramatic geometry changes.
- **Coverage / impact** (future): service levels relative to population or key destinations.

Many of these pair naturally with a specific map view or History scrubber state.

## AI Role (Assisted + Generated)
- **Compute layer** (deterministic & reviewable): Scripts and pipeline steps calculate metrics, deltas, rankings, and candidate facts. Ground truth lives in the data.
- **Curation / scoring**: Rules to highlight high-magnitude, rare, recent, or regionally relevant items ("interestingness").
- **Narrative layer** (AI-assisted): LLM turns bundles of facts + metadata into engaging prose — tweet threads, captions, report sections, or Substack-style openers. Always traceable back to the source computation and dates.
- **Human in the loop**: Curation, voice editing, pairing with visuals (screenshots from Atlas or generated), and distribution.

This keeps outputs trustworthy while scaling the storytelling.

## Possible Surfaces
- In-app: "Key Facts", "Notable Changes", or "At a Glance" cards in agency panels, History view, or a new lightweight Factbook / Discover mode.
- Exports: Markdown reports, JSON for further use, image + text bundles.
- Content workflow: Automated drafts for social / newsletters (review before posting).
- Standalone Factbook page or section (longer term).

## Phased Roadmap

### Exploration (now)
- This document
- Prototyping fact computation scripts (modeled on existing `scripts/stress-test-tiers.ts`, history builders, etc.)
- Manual or semi-manual examples to validate value

### Phase 1: Foundations
- [ ] Fact emitter script (`scripts/emit-insights.ts` or similar) that produces structured output (JSON + readable Markdown)
- [ ] Core fact types: current snapshot stats, basic history deltas, frequency distributions, simple comparisons
- [ ] Interestingness scoring prototype
- [ ] Run after refreshes or on demand against local data / zips

### Phase 2: Integration & Surfacing
- [ ] Wire computed facts into the frontend (e.g. per-agency "Notable facts" or History change highlights)
- [ ] Link facts to map states (click fact → fly to relevant view or scrubber position)
- [ ] Basic in-app explorer or filterable list of recent / top facts
- [ ] Tie-in to data quality notes (GitHub Issues overrides)

### Phase 3: Generation & Polish
- [ ] Grounded LLM prompt templates + tooling for narrative generation
- [ ] Visual suggestion system (recommended bboxes, layers, or history periods for screenshots)
- [ ] Export flows (copy text + suggested image)
- [ ] Curation UI or review queue (optional)

### Later
- Public Factbook view or newsletter component
- Deeper analytics (population-weighted, equity signals, ridership proxies where available)
- Cross-dataset comparisons (e.g. with external benchmarks)
- Automated or semi-automated content pipeline

## Integration Points
- **History app**: The strongest near-term home. Facts about what changed become natural companions to the time scrubber and route history cards.
- **Corridors**: Highlight standout shared segments.
- **Pipeline**: New optional "insights" pass during refresh or build-history.
- **Live data**: Adherence deltas and reliability facts as coverage grows.
- **Data model**: Reuse existing properties (headway, tier, headwayByPeriod, shortTurnVariants, geometry per snapshot, etc.).
- **Quality**: Leverage the new GitHub Issues pattern for documenting caveats on specific facts.

## Naming
Working title: **Atlas Factbook**

Alternatives considered:
- Atlas Insights
- Transit Signals
- Data Stories
- Atlas Notes
- Frequency Signals

We can rename later.

## Open Questions
- Balance between fully automated facts vs. human-curated "featured" items?
- Planner-focused tool vs. public-facing content engine (or both)?
- How to handle data caveats and overrides gracefully in surfaced facts?
- Preferred output formats and distribution channels?
- Visual generation approach (screenshots from live app, static renders, charts)?
- Success metrics (internal use? external engagement? planner time saved?)?

## Related Reading
- [Product Roadmap](ROADMAP_PRODUCT.md)
- [Technical Roadmap](ROADMAP_TECHNICAL.md)
- [Research](RESEARCH.md) (especially evidence gaps for planning)
- [History app work](https://github.com/Civic-Minds/Atlas) and recent geometry + scrubber improvements

---

[Back to Roadmap](../ROADMAP.md)
