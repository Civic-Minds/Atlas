# Pipeline studies

This directory records internal studies of Atlas's data-processing rules. These
are not external research projects: they use Atlas code, local GTFS archives,
controlled candidate rules, and regression outputs to support engineering and
product decisions.

Each study records:

- the pipeline question and current production rule;
- the exact code version and local archive census;
- the route-period, day-type, tier, and mode coverage tested;
- candidate rules and their classification changes;
- downstream processor effects and representative examples;
- the decision, implementation commit, and verification commands; and
- limitations or follow-up questions.

Use [`EXPERIMENT_TEMPLATE.md`](./EXPERIMENT_TEMPLATE.md) for new experiments.
Decision records should distinguish broad rule testing from end-to-end archive
regression and should record the exact code version, input census, commands,
results, and implementation commit.

## Studies

- [Frequency-tier methodology](frequency-tier-methodology-2026-10/INDEX.md):
  edge gaps, internal near misses, hard failures, and full-census validation.
