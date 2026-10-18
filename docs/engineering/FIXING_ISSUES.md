# Fixing issues

Use this page to choose the right validation path before changing Atlas. The detailed rules are split by fix type so pipeline/data guidance does not get mixed with UI guidance; local agent instruction files point here.

## Choose the scope first

- **Single agency**: a feed-specific quirk such as a bad shape point, mislabeled headsign, or excluded placeholder route. Keep the change agency-keyed and validate that agency.
- **A group**: a shared country, feed producer, or naming convention. Validate the motivating agency and other known members of that group.
- **Shared UI**: a behavior with no natural agency boundary, such as filters, route selection, panels, or map controls. Follow [`FIXING_UI_ISSUES.md`](FIXING_UI_ISSUES.md) for shared map, filter, route-selection, panel, and layout changes.
- **Shared pipeline/data**: calculations or transformations used across agencies, such as calendar logic, headways, shapes, or route metrics. Follow [`FIXING_PIPELINE_ISSUES.md`](FIXING_PIPELINE_ISSUES.md) for pipeline and published-data changes.

When the scope is uncertain, start with the narrower classification and look for evidence before generalizing. A fix that began with one agency does not become shared merely because the code change looks reusable. Frequency filter work also starts with [`FREQUENCY_RULES.md`](../product/FREQUENCY_RULES.md).

## Common workflow

1. File or identify the GitHub issue and write down the reported behavior.
2. Create a branch from the current target branch.
3. Add a regression test for the motivating case before broadening the behavior.
4. Follow the appropriate detailed validation runbook.
5. Update `[Unreleased]`, commit the logical change, and record the validation evidence.
6. Push only after explicit approval. Worker chats never push or merge; the manager does (see the rule in [DECISIONS.md](../product/DECISIONS.md)).

See [`PIPELINE.md`](../data/PIPELINE.md) for the underlying processing methodology, [`ADDING_AGENCIES.md`](../data/ADDING_AGENCIES.md) for feed onboarding and publication, and [`BRANCH_WORKFLOW.md`](BRANCH_WORKFLOW.md) for the single-`main` branch model.

## The six-agency rule (pipeline and UI runbooks)

Both shared-fix runbooks require this, so it is written once here:

- Validate at least **six additional trusted agencies** beyond every agency involved in the reported fix; the motivating agency or agencies do not count. All six must pass.
- The additional set must span at least **two countries** whenever two applicable countries exist. Prefer country diversity before taking a second agency from any country.
- If fewer than six other agencies can express the behavior, test every applicable agency and record that limitation.
- Record the exact agencies, countries, commands or interactions, and result in the GitHub issue or commit message.
- Three spot-check agencies are not enough for a shared change.
