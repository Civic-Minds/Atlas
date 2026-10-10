# Reprocessing shared route data

Use this workflow when `process-core.ts` adds or changes a derived route field. A PMTiles rebuild alone is not enough: it only packages the already-published route JSON, and the normal refresh skips feeds whose schedule identity has not changed.

## Dry run

This reads the newest archived GTFS snapshot for every production-visible agency and writes regenerated artifacts to `tmp/derived-reprocess/`:

```bash
npm run reprocess-derived-artifacts
ATLAS_LOCAL_PREVIEW_DIR=tmp/derived-reprocess npm run build-pmtiles -- --dry-run
```

Review `tmp/derived-reprocess/report.json`. The PMTiles build must succeed for the complete catalog; an old agency artifact fails the schema gate instead of being silently repackaged.

The reprocess fails closed per agency: it refuses (and writes nothing) when the newest archived zip cannot be identified, when its service dates are expired or older than the live feed's, or when the [release diff gate](#release-diff-gate) raises a red flag. The gate runs over the whole batch after processing and before any R2 write. Pass `--allow-drop` to accept reviewed drops, or `--allow <slug>:<flag>` for one reviewed flag on one agency. Limit a run with `--only-slug <slug>` (repeatable). Hidden agencies are skipped unless named with `--only-slug <slug> --include-hidden`; they stay hidden and only their R2 artifacts are corrected. With `--write`, an agency in a country with no production-visible agencies is skipped, the same country-launch rule `process` and `refresh` apply, unless `--i-am-launching-country` is passed after explicit approval ([#668](https://github.com/Civic-Minds/Atlas/issues/668)).

If the report contains missing raw archives, recover and validate local inputs
before retrying the reprocess:

```bash
npm run recover-local-archive-inputs
ATLAS_LOCAL_ARCHIVE_DIR=tmp/derived-reprocess-inputs \
  NODE_OPTIONS='--max-old-space-size=8192' \
  REPROCESS_CONCURRENCY=2 npm run reprocess-derived-artifacts
```

Manually reviewed replacement URLs can be supplied without changing the
registry or R2:

```bash
npm run recover-local-archive-inputs -- --sources-file=tmp/source-overrides.json
```

The recovery report records the URL, feed dates, feature count, quality score,
and any unresolved blocker. A recovered local input is not approval to publish
it.

## Publish

After reviewing the dry-run report, publish the regenerated agency artifacts and then rebuild the verified release:

```bash
npm run reprocess-derived-artifacts -- --write
npm run build-pmtiles -- --allow-stale-data
npm run verify-pmtiles-remote
npm run build-history
npm run publish-data-release
```

`publish-data-release` compares the whole release with the public one again, so repeat every `--allow <slug>:<flag>` you accepted during the reprocess on it (for example `npm run publish-data-release -- --allow communitytransit:drop`).

A reprocess does not leave the refresh handoff marker that `build-pmtiles` normally requires, so this intentional repack needs `--allow-stale-data`. `build-pmtiles` checks full agency coverage locally before uploading an immutable release under `atlas/releases/{id}/`; `verify-pmtiles-remote` smoke-tests the upload, and only `publish-data-release` moves `atlas/release.json` to make it live.

These commands write public R2 data. Get explicit approval immediately before running the `--write` or publish commands.

## Release diff gate

`refresh` (and so `refresh-release`), `reprocess-derived-artifacts --write` and `publish-data-release` all run one shared check (`pipeline/releaseDiff.ts`, [#671](https://github.com/Civic-Minds/Atlas/issues/671)) before any R2 write. It compares each agency's new output with what is live and writes a report to `tmp/release-diff/<run-id>.md` and `.json` (for publish, the run ID is the release ID), then prints a short summary.

- **What counts as live:** `refresh` and `reprocess` compare with `atlas/<slug>.json`. `publish-data-release` compares each snapshot in the new release with the same agency in the public release (`atlas/release.json`).
- **Hidden agencies:** checked by `refresh` and `reprocess`, where their data is written. They are not part of a release.
- **Duplicate peers:** the other agencies in the same run, plus the live output of registry agencies near the new output. At publish, peers are the agencies in the new release and nothing else. Every hidden or staged agency is also a peer, wherever it is. A match with one is a yellow `duplicate` that does not block, since the hidden copy does not reach users (#621, #674). A hidden agency that is itself being checked is still red against a visible peer (#615).

| Flag | Level | Fires when |
|---|---|---|
| `drop` | red | More than 20% of live routes, stops or stop points are lost. This is the same drop guard as before (#628, #657). Reprocess also refuses when live data cannot be read. |
| `empty` | red | Live had routes; the new output has none. |
| `mode-lost` | red | A mode present live is missing from the new output, for example Commuter Rail ([#616](https://github.com/Civic-Minds/Atlas/issues/616)). |
| `duplicate` | red | The route output is identical to a different agency's, or at least 90% of its route-ID and shape-endpoint signatures match (both need at least 3) ([#615](https://github.com/Civic-Minds/Atlas/issues/615)). |
| `headway-shift` | red | The median weekday headway halves or doubles on at least 30% of the routes present in both. Needs at least 5 comparable routes and 3 shifted routes. Typical cause: a holiday picked as the reference weekday ([#658](https://github.com/Civic-Minds/Atlas/issues/658)). |
| `headway-shift` | yellow | The same shift on 10% to 30% of routes. |
| `expired` | red | Service has already ended and the output differs from live. |
| `expired` | yellow | Service has ended, but the output is unchanged from live. This keeps long-expired agencies from blocking every release. |
| `future-start` | yellow | Service does not start until a future date (refresh and reprocess, which read the zip). |
| `placeholder-expiry` | yellow | The calendar runs more than 2 years past today, likely a placeholder end date; the recorded expiry is capped so the agency can still show as outdated. |
| `added` | yellow | The agency has no live artifact to compare with (for example, new to the release), or its live artifact predates route schema v2. No before/after diff is taken. The duplicate and date checks still run. Reprocess still refuses an agency whose live artifact cannot be read at all. |

A red flag blocks only its own agency. In refresh and reprocess, that agency keeps its live data and the rest of the batch continues. At publish, the pointer does not move. Yellow flags are informational and never block.

After reviewing a red flag, accept it for one agency with `--allow <slug>:<flag>` (repeatable; `--allow=<slug>:<flag>` also works). `--allow-drop` keeps its old meaning: it accepts the drop flag for every agency in the run, and nothing else. `refresh-release` passes both forms to `refresh` and to `publish-data-release`. Unknown flags or agencies are rejected.

Before writing anything, preview the gate with read-only reads of the public bucket (no credentials needed):

```bash
npm run release-diff -- --new-dir tmp/derived-reprocess --archive-dir <dir of <slug>.zip>
npm run release-diff -- --new-release <releaseId>   # an uploaded release, before publish-data-release
```

