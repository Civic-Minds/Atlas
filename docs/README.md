# Atlas documentation

This is the one index of Atlas documentation: one row per tracked doc, with the one job it does. The root [README](../README.md) explains the product. Before creating any doc, check this page and extend the doc that already does the job instead of adding another. A test (`scripts/__tests__/docsIndex.test.ts`) fails when a tracked doc has no row here. Studies under `docs/research/` are covered by [their own index](research/INDEX.md).

## Rules and decisions

| Doc | Job |
|---|---|
| [Decisions](product/DECISIONS.md) | The settled rules (what, why, source) and the dated decision log. Check it before asking Ryan anything. |
| [Frequency filter rules](product/FREQUENCY_RULES.md) | The 11 filter rules and the only table of frequency thresholds. |
| [Style guide](STYLE.md) | How Atlas looks and talks. Read before any UI work. |
| [How Live measures a route](product/LIVE_METHOD.md) | How the Live route page computes delay, bunching, run time and extra wait. |
| [Glossary](GLOSSARY.md) | What each internal term means in code, where it lives, and its UI word. |
| [Data principles](data/DATA_PRINCIPLES.md) | Freshness, corrections and static versus live data. |
| [Display naming](data/DISPLAY_NAMING.md) | The two rules for how agency names render. |
| [Security policy](../SECURITY.md) | How to report a vulnerability. |
| [Terms of service](../TERMS.md) | Terms for the public site. |

## How to work

| Doc | Job |
|---|---|
| [Branch and deployment workflow](engineering/BRANCH_WORKFLOW.md) | One `main` branch, three deployments, worktrees and PR flow. |
| [Fixing issues (runbook index)](engineering/FIXING_ISSUES.md) | Scope guide, common workflow, the six-agency rule, and links to the two validation runbooks. |
| [Fixing issues (root pointer)](../FIXING_ISSUES.md) | Pointer to the runbook index. |
| [Pipeline fix validation](engineering/FIXING_PIPELINE_ISSUES.md) | Required validation for shared pipeline and data fixes. |
| [UI fix validation](engineering/FIXING_UI_ISSUES.md) | Required validation for shared UI fixes. |
| [Issue filing](engineering/ISSUES.md) | How to file, triage and close GitHub issues. |
| [Performance benchmark](engineering/PERFORMANCE_BENCHMARK.md) | Repeatable public-versus-candidate load testing. |
| [Adding agencies](data/ADDING_AGENCIES.md) | Onboarding one agency, including the new-country gate. |
| [Updating the map](data/MAP_UPDATES.md) | Batch refresh and publish; the one full description of `refresh-release`. |
| [Coverage gap discovery](data/COVERAGE_GAP_DISCOVERY.md) | Finding new agency candidates and their feeds. |
| [Reprocessing shared route data](operations/DATA_REPROCESSING.md) | Cloud and local full rebuilds, and the release diff gate. |
| [Staging R2](operations/STAGING.md) | The staging bucket for rehearsals. |
| [Manual GTFS refresh queue](operations/MANUAL_GTFS_REFRESHES.md) | Source-recovery queue for expired feeds. |
| [Manually maintained GTFS sources](operations/MANUAL_GTFS_SOURCES.md) | Agencies maintained by hand rather than from a feed URL. |
| [Live analysis](operations/LIVE_ANALYSIS.md) | How to build and read the local Live route analysis. |
| [Pipeline studies index](engineering/pipeline-studies/INDEX.md) | What an internal pipeline study must record. |
| [Pipeline study template](engineering/pipeline-studies/EXPERIMENT_TEMPLATE.md) | Blank template for a pipeline experiment. |
| [Catalog scan](../scripts/catalog-scan/README.md) | Running before and after catalog scans of two checkouts. |

## What exists

| Doc | Job |
|---|---|
| [Architecture](ARCHITECTURE.md) | R2 buckets, release data flow, API routes, env vars. |
| [Feature flags](FEATURE_FLAGS.md) | Every flag, deployment topology, and the one statement of Live's status. |
| [Data](DATA.md) | Data documentation overview and the History archive policy. |
| [Agencies](data/AGENCIES.md) | Static coverage reference. |
| [Pipeline methodology](data/PIPELINE.md) | How GTFS becomes frequency tiers. |
| [Route service metrics](data/ROUTE_SERVICE_METRICS.md) | Field-level contract for route service values. |
| [History coverage](data/DATA_HISTORY.md) | The History app model, eligibility and agency status log. |
| [Live polling](operations/LIVE_POLLING.md) | Which GTFS-RT feeds are polled or parked. |
| [Known issues](operations/KNOWN_ISSUES.md) | Standing data gaps, feed quirks and platform limits. |
| [Feed status snapshot](operations/GTFS_FEED_STATUS.md) | Historical snapshot of the 2026-08-10 refresh. |
| [Factbook proposal](roadmap/experiments/FACTBOOK.md) | Proposal for a Factbook of data-driven facts. |
| [Agency config](../config/agencies/README.md) | How agency config files and `modeOverrides` work. |
| [Pipeline stages](../pipeline/README.md) | Pipeline stages to modules. |
| [Stretch fixtures](../pipeline/__tests__/fixtures/STRETCH-FIXTURES.md) | Cut GTFS fixtures for the trip-set selector tests. |
| [Places data](../shared/data/README.md) | Source and use of `na-places.json`. |
| [Metro population data](../shared/data/metro-population/README.md) | Sources and rule for the large-metros population data. |
| [UI components](../src/components/README.md) | Shared UI primitives to reuse. |

## Plans

| Doc | Job |
|---|---|
| [Roadmap](roadmap/ROADMAP.md) | Roadmap index and the one status line for retired surfaces. |
| [Product roadmap](roadmap/PRODUCT.md) | App surfaces and product to-dos. |
| [Platform roadmap](roadmap/PLATFORM.md) | History, change analysis and public tools. |
| [Technical roadmap](roadmap/TECHNICAL.md) | Live provider contract, rendering and analysis infrastructure. |
| [Vision](product/VISION.md) | Product philosophy. |
| [Strategy](product/STRATEGY.md) | Competitive landscape and positioning. |
| [Product research](product/RESEARCH.md) | Agency pain points informing the direction. |
| [Agency backlog](data/AGENCY_BACKLOG.md) | Prioritised queue and batch history for adding agencies. |
| [Experiment ideas](roadmap/EXPERIMENT_IDEAS.md) | Uncommitted idea list (the root EXPERIMENTS.md lists implemented ones). |

## History and research

| Doc | Job |
|---|---|
| [Research index](research/INDEX.md) | Every study under `docs/research/`. |
| [Experiments](../EXPERIMENTS.md) | Index of implementation and QA experiments, including the validated-not-enabled ones. |
| [Stop-hub clustering](experiments/stop-hub-clustering.md) | Record of the offline stop-hub clustering experiment. |
| [Fixed-period edge transition gap](experiments/fixed-period-edge-transition-gap/README.md) | Record of a validated, not-enabled diagnostic field. |
| [Route accuracy spot check](audits/route-accuracy-spot-check-2026-09.md) | Generated GTFS-versus-Atlas spot check, September 2026. |
| [Frequency-tier study](engineering/pipeline-studies/frequency-tier-methodology-2026-10/INDEX.md) | Full evidence for the frequency-tier rules. |
| [Frequency-tier decision trail](engineering/pipeline-studies/frequency-tier-methodology-2026-10/EXPERIMENT-LOG.md) | FREQ-001 to FREQ-006 with commit SHAs. |
| [Frequency-tier proposal](engineering/pipeline-studies/frequency-tier-methodology-2026-10/PROPOSAL.md) | Superseded proposal, kept as history. |
| [Test audit](engineering/TEST_AUDIT_2026-10.md) | One-time test suite audit (October 2026). |
| [Changelog](../CHANGELOG.md) | Release notes since 3.0.0. |
| [Changelog archive](../CHANGELOG_ARCHIVE.md) | Release notes before 3.0.0. Immutable. |
| [Research archive](research/INDEX.md#superseded-and-historical) | Superseded research snapshots, kept intact under `docs/research/archive/`. |

## Agent files (local, untracked)

Listed for completeness; they are not in git. `AGENTS.md` (with `CLAUDE.md` and `GEMINI.md` symlinks to it) holds the working rules for AI tools, `HANDOFF.md` is written only on a mid-task cutoff, and `ATLASLOG.md` is the old portfolio log format. Settled rules are in [Decisions](product/DECISIONS.md), not in these files.

Also at the repo root: [README](../README.md), the product pitch.
