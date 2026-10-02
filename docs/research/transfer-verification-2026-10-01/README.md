# Transfer-policy verification

Snapshot date: 2026-10-01. This is a confirmation pass over the prior transfer-policy inventory.

Canonical files:

- `transfer-verification-ledger.json` — reconciled 693-agency ledger with verification results attached.
- `transfer-verification-ledger.csv` — flat export of the reconciled ledger.
- `transfer-verification-summary.md` — summary of accessibility and evidence comparisons.
- `transfer-verification-manual-review.json` — current manual-review queue from the reconciled ledger.

Raw recheck outputs are kept in `raw/`:

- `raw/verification-results.json` — direct source recheck results.
- `raw/review-queue.json` — queue generated before reconciliation or later manual audit updates.

The reconciled ledger is authoritative. Raw outputs are retained as evidence and should not be treated as the final status source.
