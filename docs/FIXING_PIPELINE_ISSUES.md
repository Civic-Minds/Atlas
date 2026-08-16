# Fixing Pipeline and Data Issues

Use this runbook for shared processing, metrics, transformations, and published data. Browser spot-checks alone never validate a pipeline change.

## Required validation

1. Add a regression test for the reported case and at least one legitimate case the change could accidentally suppress or alter.
2. Run the full automated test suite.
3. Run a dry-run reprocess and produce a before/after diff for the affected output. Quantify changed, newly-null, newly-present, and materially different values.
4. Validate at least **six additional trusted agencies** beyond every agency involved in the reported fix; the motivating agency or agencies do not count. All six must pass. Select one agency from each applicable country before choosing a second from any country. If six countries are available, use six countries. Then use remaining slots for additional agencies or feed families in the highest-risk countries.
5. Cover every country and known feed family that will consume the changed path. If a country or feed family has only one applicable agency, test it and record that limitation. At least one passing agency must be outside the country that motivated the change.
6. Include relevant risk cases: for example, multi-branch routes, sparse service, foreign feeds, short turns, and known historical regressions. Test every affected service state, not only a successful default case.
7. Investigate every unexplained output change before committing. Expand to the full catalog when the diff cannot establish a safe boundary.
8. Record the exact agencies, countries, feed families, commands, diff summary, and result in the GitHub issue or commit message.

Three spot-check agencies are not sufficient evidence for a shared pipeline rule. Issue [#279](https://github.com/Civic-Minds/Atlas/issues/279) compared 44,886 route/stop combinations across Halifax, TTC, and Madison and still found 5.2% newly-null values and 23% materially changed values. The size and shape of the output diff matters more than the agency count alone.

The commit hook blocks changes to core pipeline files unless the commit changes a pipeline test or includes a `Validated:` line. `Validated: n/a - <reason>` is valid for a pure refactor, but unexplained output changes are not.

## Do not generalize prematurely

If the evidence does not separate the real problem from legitimate cases that merely look similar, keep the fix narrow: use an agency override, exclusion, or group-specific transform rather than a global rule.
