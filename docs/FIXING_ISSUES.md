# Fixing Issues

How to scope a fix and decide how much validation it needs, once a bug is understood. For filing/closing conventions (titles, labels, issue types, commit-based auto-close) see [`ISSUES.md`](./ISSUES.md). For the frequency-calculation methodology itself see [`PIPELINE.md`](./PIPELINE.md).

## Scope the fix to its blast radius first

Before writing a fix, classify what it actually touches. This determines both how the fix should be scoped in code and how much validation is enough before trusting it.

- **Single agency** — a feed-specific data quirk (a bad shape point, a mislabeled headsign, an excluded placeholder route). Scope the fix narrowly: an `index.json` override, an agency-keyed exclusion list, a slug-gated branch. Validate against that one agency only — re-run the dry-run process and route-report for it and confirm the specific symptom is gone.
- **A group** — shared by an identifiable subset of agencies (a country's schedule-export convention, a shared line-code naming scheme, a GTFS producer's known quirks). Validate against other known members of that group, not the whole catalog — even if only one member was reported, check a couple of others that share the same trait.
- **All agencies** — a shared pipeline or UI code path with no natural group boundary (calendar/service-date logic, headway calculation, shape-anomaly detectors, panel-overlay logic). Validate broadly: run the full automated test suite, and spot-check a diverse set of already-trusted agencies (a mix of long-established ones and newer ones) to confirm nothing shifted, regardless of how narrow the triggering report seemed.

## Don't generalize prematurely

A fix that looks safe against the reported case can still misfire elsewhere. Before turning a specific fix into a general rule, sweep it against a broad, diverse set of agencies and look specifically for cases where the general rule would produce a wrong result. If the evidence doesn't cleanly separate the real problem from legitimate cases that merely look similar, keep the fix narrowly scoped (an exclusion list, an override) rather than generalizing on partial evidence — a narrow fix that under-corrects is safer than a general rule that silently corrupts a case it wasn't tested against.

## Hard gate (not just policy)

The "all agencies" tier above used to be policy only, and it was skipped repeatedly: a single-agency report (Halifax route 330, AI-217) generalized into an unvalidated change to the shared all-day headway computation, a second single-case fix (TTC, `f9001a4f`) stacked on top of it two days later, and the two combined broke on 32 routes across 18 French cities before anyone noticed ([#263](https://github.com/Civic-Minds/Atlas/issues/263), [#279](https://github.com/Civic-Minds/Atlas/issues/279)).

A `commit-msg` hook (`.githooks/commit-msg`, active once `npm install` has run) now blocks any commit touching `pipeline/process-core.ts`, `pipeline/headway-utils.ts`, `pipeline/transit-calendar.ts`, `pipeline/transit-phase1.ts`, `pipeline/transit-phase2.ts`, `pipeline/shape-selection.ts`, `pipeline/transit-corridors.ts`, or `pipeline/parseGtfs.ts` unless the commit either changes a file under `pipeline/__tests__/` or the commit message has a `Validated:` line. `Validated: n/a - <reason>` is a legitimate answer for a pure refactor — the gate isn't a review, it's a forcing function so the scoping decision is written down somewhere durable instead of only existing in a chat session.
