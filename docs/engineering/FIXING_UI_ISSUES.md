# Fixing shared UI issues

Use this runbook for shared map, filter, route-selection, panel, and layout behavior.

## Required validation

1. Add a regression test for the reported case and at least one legitimate case the change could accidentally hide, select, or relabel.
2. Run the full automated test suite.
3. Follow the [six-agency rule](FIXING_ISSUES.md#the-six-agency-rule-pipeline-and-ui-runbooks) by exercising the agencies in the UI. Include at least two long-established agencies, two newer agencies, and two agencies selected for the specific UI risk.
4. If the UI behavior depends on country-specific configuration, wording, or formatting, include one passing agency from every applicable country before filling the remaining samples.
5. Exercise every affected state, not just a successful page load: matching and non-matching filters, both directions, no-service periods, selected-route overrides, search/map selection, and panel transitions where those states apply.
6. Record the exact agencies, countries, states, browser URL or interaction, test command, and result in the GitHub issue or commit message.
