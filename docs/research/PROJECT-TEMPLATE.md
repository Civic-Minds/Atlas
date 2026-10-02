# [Research project name]

Snapshot date: `YYYY-MM-DD`  
Scope: [agencies, routes, systems, or other unit of research]

## Purpose

[One or two sentences describing the research question and intended use.]

## Canonical files

| File | Purpose |
|---|---|
| `[project].json` | Structured source of truth |
| `[project].csv` | Flat export, when useful |
| `[project].md` | Human-readable summary |
| `raw/` | Source captures and downloaded evidence |
| `[project]-queue.json` | Unresolved or follow-up records |

The JSON ledger is authoritative. CSV and Markdown files are derived views.

## Method

- Primary source: [official agency, government, or project source].
- Secondary sources: [documented fallback sources, if any].
- Baseline: [comparison baseline].
- Research date: `YYYY-MM-DD`.

## Status

- Records in scope: [count]
- Confirmed: [count]
- Partially confirmed: [count]
- No published result: [count]
- Inaccessible or unresolved: [count]

## Record fields

Every structured record should include, where applicable:

- `slug` and `name`
- `researchDate`
- `sourceUrl`
- `checkedAt`
- `effectiveDate` or `null` when not published
- `status`
- `confidence`
- `evidence`
- `notes` or a next action for unresolved records

## Review rules

- Preserve raw user or source evidence separately from derived conclusions.
- Do not infer a positive result from the absence of a published policy.
- Keep unresolved and inaccessible records explicit in the queue.
- Preserve prior dated snapshots; create a new snapshot for a new research pass.
