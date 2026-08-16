# Fixing Issues

Use this page to choose the right validation path before changing Atlas. The detailed rules are intentionally split by fix type so pipeline/data guidance does not get mixed with UI guidance.

## Choose the scope first

- **Single agency** — a feed-specific quirk such as a bad shape point, mislabeled headsign, or excluded placeholder route. Keep the change agency-keyed and validate that agency.
- **A group** — a shared country, feed producer, or naming convention. Validate the motivating agency and other known members of that group.
- **Shared UI** — a behavior with no natural agency boundary, such as filters, route selection, panels, or map controls. Follow [`docs/FIXING_UI_ISSUES.md`](docs/FIXING_UI_ISSUES.md).
- **Shared pipeline/data** — calculations or transformations used across agencies, such as calendar logic, headways, shapes, or route metrics. Follow [`docs/FIXING_PIPELINE_ISSUES.md`](docs/FIXING_PIPELINE_ISSUES.md).

When the scope is uncertain, start with the narrower classification and look for evidence before generalizing. A fix that began with one agency does not become shared merely because the code change looks reusable.

## Common workflow

1. File or identify the GitHub issue and write down the reported behavior.
2. Create a branch from the current target branch.
3. Add a regression test for the motivating case before broadening the behavior.
4. Follow the appropriate detailed validation runbook.
5. Update `[Unreleased]`, commit the logical change, and record the validation evidence.
6. Push only after explicit approval.

See [`docs/PIPELINE.md`](docs/PIPELINE.md) for the underlying processing methodology and [`docs/ADDING_AGENCIES.md`](docs/ADDING_AGENCIES.md) for feed onboarding and publication procedures.

See [`docs/BRANCH_WORKFLOW.md`](docs/BRANCH_WORKFLOW.md) for the single-`main` branch model and the separate beta/production deployment workflow.
