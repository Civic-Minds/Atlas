# Atlas documentation

This is the one index of Atlas documentation: one row per tracked doc, with the one job it does. The root [README](../README.md) explains the product. Before creating any doc, check this page and extend the doc that already does the job instead of adding another. A test (`scripts/__tests__/docsIndex.test.ts`) fails when a tracked doc has no row here. Studies under `docs/research/` are covered by [their own index](research/INDEX.md).

Find the group that matches your task. Each group opens with the docs to read first, in order, then lists every doc for that kind of work.

## Rules and decisions

Read first: [Decisions](product/DECISIONS.md) for what is settled, then the [Glossary](GLOSSARY.md) when a term is unclear.

| Doc | Job |
|---|---|
| [Decisions](product/DECISIONS.md) | Open before asking Ryan anything, to see whether the rule is already settled (what, why, source) or in the dated log. |
| [Glossary](GLOSSARY.md) | Open when an internal term is unclear, or when you need the matching UI word. |
| [Data principles](data/DATA_PRINCIPLES.md) | Open when you decide how fresh data must be, or whether a number is static or live. |
| [Display naming](data/DISPLAY_NAMING.md) | Open when an agency name renders oddly or you add a new name. |
| [Security policy](../SECURITY.md) | Open when someone reports a security problem. |
| [Terms of service](legal/TERMS.md) | Open when a question touches the public site's legal terms; the /terms page is built from this file, so edit it here. |
| [Privacy policy](legal/PRIVACY.md) | Open when a question touches privacy, analytics or stored data; the /privacy page is built from this file, so edit it here. |
| [Terms of service (root pointer)](../TERMS.md) | Open only if you landed here from the repo root; it points to the legal docs. |

## Frequency numbers and filter questions

Read first: [Decisions](product/DECISIONS.md), then [Frequency filter rules](product/FREQUENCY_RULES.md) for the thresholds, then [Pipeline fix validation](engineering/FIXING_PIPELINE_ISSUES.md) before you change anything shared.

| Doc | Job |
|---|---|
| [Frequency filter rules](product/FREQUENCY_RULES.md) | Open when you change a tier threshold or the route filter; it holds the 11 rules and the only threshold table. |
| [Pipeline fix validation](engineering/FIXING_PIPELINE_ISSUES.md) | Open when your fix changes shared pipeline code or data, before you commit. |
| [Pipeline methodology](data/PIPELINE.md) | Open when you need to understand how raw GTFS turns into frequency tiers. |
| [Route service metrics](data/ROUTE_SERVICE_METRICS.md) | Open when you add or read a route service field and need its exact meaning. |
| [Frequency-tier study](engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md) | Open when you need the evidence behind a frequency-tier rule. |
| [Frequency-tier decision trail](engineering/pipeline-studies/frequency-tier-methodology-2026-10/EXPERIMENT-LOG.md) | Open when you need to trace which commit made a frequency-tier change (FREQ-001 to FREQ-006). |
| [Frequency-tier proposal](engineering/pipeline-studies/frequency-tier-methodology-2026-10/PROPOSAL.md) | Open only for history; this proposal was superseded. |

## Live work

Read first: [Decisions](product/DECISIONS.md), then [How Live measures a route](product/LIVE_METHOD.md) for the measures, then [Feature flags](FEATURE_FLAGS.md) for Live's status. For review, critic checklist: Atlas-worktrees/_reports/live-critic-brief.md (local, not in git).

| Doc | Job |
|---|---|
| [How Live measures a route](product/LIVE_METHOD.md) | Open when you change or question a Live number: delay, bunching, run time or extra wait. |
| [Feature flags](FEATURE_FLAGS.md) | Open when you add, change or check a flag, or need Live's current status. |
| [Live polling](operations/LIVE_POLLING.md) | Open when Live shows no data for an agency, to see whether its feed is polled or parked. |
| [Live analysis](operations/LIVE_ANALYSIS.md) | Open when you build or read the local Live route analysis. |

## Rebuilds and publishing

Read first: [Decisions](product/DECISIONS.md), then [Reprocessing shared route data](operations/DATA_REPROCESSING.md) for rebuilds and the release diff gate, then [Updating the map](data/MAP_UPDATES.md) for batch refresh and publish.

| Doc | Job |
|---|---|
| [Reprocessing shared route data](operations/DATA_REPROCESSING.md) | Open when you run a full rebuild of shared route data or check a release diff. |
| [Updating the map](data/MAP_UPDATES.md) | Open when you refresh many agencies at once or publish the result (`refresh-release`). |
| [Staging R2](operations/STAGING.md) | Open when you rehearse a publish before touching the live bucket. |
| [Catalog scan](../scripts/catalog-scan/README.md) | Open when you compare the catalog before and after a change. |
| [Performance benchmark](engineering/PERFORMANCE_BENCHMARK.md) | Open when a change might slow the site and you need a repeatable load test. |

## Adding or fixing an agency or feed

Read first: [Decisions](product/DECISIONS.md), then [Adding agencies](data/ADDING_AGENCIES.md) for onboarding, then [Known issues](operations/KNOWN_ISSUES.md) to see whether the gap is already recorded.

| Doc | Job |
|---|---|
| [Adding agencies](data/ADDING_AGENCIES.md) | Open when you add one agency, or the agency is in a new country. |
| [Known issues](operations/KNOWN_ISSUES.md) | Open when something looks wrong, to check whether the gap is already known. |
| [Manual GTFS refresh queue](operations/MANUAL_GTFS_REFRESHES.md) | Open when a feed has expired and you need to recover its source. |
| [Manually maintained GTFS sources](operations/MANUAL_GTFS_SOURCES.md) | Open when an agency has no feed URL and its data is kept by hand. |
| [Coverage gap discovery](data/COVERAGE_GAP_DISCOVERY.md) | Open when you look for agencies Atlas does not cover yet. |
| [Agency config](../config/agencies/README.md) | Open when you edit an agency config file or a `modeOverrides` entry. |
| [Agencies](data/AGENCIES.md) | Open when you need the static list of which agencies Atlas covers. |
| [History coverage](data/DATA_HISTORY.md) | Open when you work on History, check why an agency is or is not eligible, or need the archive policy for past schedule periods. |
| [Agency backlog](data/AGENCY_BACKLOG.md) | Open when you pick the next agencies to add or check what was already batched. |
| [Feed status snapshot](operations/GTFS_FEED_STATUS.md) | Open only for the 2026-08-10 refresh results; it is a historical snapshot. |
| [Places data](../shared/data/README.md) | Open when you change or rely on `na-places.json`. |
| [Metro population data](../shared/data/metro-population/README.md) | Open when you change or cite the large-metros population data. |

## UI and wording

Read first: [Decisions](product/DECISIONS.md), then the [Style guide](STYLE.md) for look and wording, then [UI fix validation](engineering/FIXING_UI_ISSUES.md) before you change shared UI.

| Doc | Job |
|---|---|
| [Style guide](STYLE.md) | Open before any UI change, for how Atlas looks and what words it uses. |
| [UI components](../src/components/README.md) | Open before you build UI, to reuse a shared primitive instead of adding one. |
| [UI fix validation](engineering/FIXING_UI_ISSUES.md) | Open when your fix changes shared UI, before you commit. |

## Fixing a reported bug and working on the repo

Read first: [Decisions](product/DECISIONS.md) to check the behavior is not intended, then [Fixing issues](engineering/FIXING_ISSUES.md) for scope and workflow, then [Issue filing](engineering/ISSUES.md) for the GitHub issue and `Fixes #N` rules.

| Doc | Job |
|---|---|
| [Fixing issues (runbook index)](engineering/FIXING_ISSUES.md) | Open when you start any fix, to pick the scope and the right validation runbook. |
| [Issue filing](engineering/ISSUES.md) | Open when you file, triage or close a GitHub issue. |
| [Branch and deployment workflow](engineering/BRANCH_WORKFLOW.md) | Open before you start a branch or worktree, or when a deployment looks stale. |
| [Fixing issues (root pointer)](../FIXING_ISSUES.md) | Open only if you landed here from the repo root; it points to the runbook index. |
| [Pipeline studies index](engineering/pipeline-studies/INDEX.md) | Open before you start an internal pipeline study. |
| [Pipeline study template](engineering/pipeline-studies/EXPERIMENT_TEMPLATE.md) | Open when you start a new pipeline experiment and need the blank template. |

## Reference, plans and research

Read first: [Architecture](ARCHITECTURE.md) for where data lives, then the [Research index](research/INDEX.md) before starting any study.

| Doc | Job |
|---|---|
| [Architecture](ARCHITECTURE.md) | Open when you need to know where data lives, how a release flows, or which env var does what. |
| [How Atlas data flows](DATA.md) | Open for a short overview of how data moves from feeds to the published map, with a link to the doc for each step. |
| [Pipeline stages](../pipeline/README.md) | Open when you need to find which module runs a pipeline stage. |
| [Stretch fixtures](../pipeline/__tests__/fixtures/STRETCH-FIXTURES.md) | Open when you edit the trip-set selector tests and need to know what the fixtures are. |
| [Research index](research/INDEX.md) | Open when you look for any study under `docs/research/`. |
| [Experiments](../EXPERIMENTS.md) | Open before you repeat an experiment, to see what was tried or validated but not enabled. |
| [Stop-hub clustering](experiments/stop-hub-clustering.md) | Open when you revisit stop-hub clustering. |
| [Fixed-period edge transition gap](experiments/fixed-period-edge-transition-gap/README.md) | Open when you consider enabling the fixed-period edge transition field. |
| [Route accuracy spot check](audits/route-accuracy-spot-check-2026-09.md) | Open when you need the September 2026 GTFS-versus-Atlas accuracy results. |
| [Test audit](engineering/TEST_AUDIT_2026-10.md) | Open when you judge test coverage; it is the October 2026 audit. |
| [Roadmap](roadmap/ROADMAP.md) | Open to see what is planned, and which surfaces are retired. |
| [Product roadmap](roadmap/PRODUCT.md) | Open when you look for product to-dos on an app surface. |
| [Platform roadmap](roadmap/PLATFORM.md) | Open when you look for platform to-dos on History, change analysis or public tools. |
| [Technical roadmap](roadmap/TECHNICAL.md) | Open when you look for technical to-dos on Live providers, rendering or analysis. |
| [Vision](product/VISION.md) | Open when a product choice needs the underlying philosophy. |
| [Strategy](product/STRATEGY.md) | Open when wording or priorities depend on competitors or positioning. |
| [Product research](product/RESEARCH.md) | Open when you need evidence of what agencies struggle with. |
| [Experiment ideas](roadmap/EXPERIMENT_IDEAS.md) | Open when you look for ideas not yet committed to; implemented ones are in the root EXPERIMENTS.md. |
| [Factbook proposal](roadmap/experiments/FACTBOOK.md) | Open when you consider building the Factbook; it is only a proposal. |
| [Changelog](../CHANGELOG.md) | Open when you check what changed in a release since 3.0.0. |
| [Changelog archive](../CHANGELOG_ARCHIVE.md) | Open when you check a release before 3.0.0; never edit it. |
| [Research archive](research/INDEX.md#superseded-and-historical) | Open only for old research snapshots under `docs/research/archive/`. |

## Agent files (local, untracked)

Listed for completeness; they are not in git. `AGENTS.md` (with `CLAUDE.md` and `GEMINI.md` symlinks to it) holds the working rules for AI tools, `HANDOFF.md` is written only on a mid-task cutoff, and `ATLASLOG.md` is the old portfolio log format. Settled rules are in [Decisions](product/DECISIONS.md), not in these files.

Also at the repo root: [README](../README.md), the product pitch.
