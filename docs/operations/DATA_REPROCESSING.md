# Reprocessing shared route data

Use this workflow when `process-core.ts` adds or changes a derived route field. A PMTiles rebuild alone is not enough: it only packages the already-published route JSON, and the normal refresh skips feeds whose schedule identity has not changed.

## Dry run

This reads the newest archived GTFS snapshot for every production-visible agency and writes regenerated artifacts to `tmp/derived-reprocess/`:

```bash
npm run reprocess-derived-artifacts
ATLAS_LOCAL_PREVIEW_DIR=tmp/derived-reprocess npm run build-pmtiles -- --dry-run
```

Review `tmp/derived-reprocess/report.json`. The PMTiles build must succeed for the complete catalog; an old agency artifact fails the schema gate instead of being silently repackaged.

The reprocess fails closed per agency: it refuses (and writes nothing) when the newest archived zip cannot be identified, when its service dates are expired or older than the live feed's, or when the [release diff gate](#release-diff-gate) raises a red flag. The gate runs over the whole batch after processing and before any R2 write. Pass `--allow-drop` to accept reviewed drops, or `--allow <slug>:<flag>` for one reviewed flag on one agency. Limit a run with `--only-slug <slug>` (repeatable). Leave an agency out with `--skip-slug <slug>` (repeatable): it is not reprocessed and keeps its live artifacts, so the gate and a preview PMTiles build see it unchanged. An unknown slug, or one named by both `--only-slug` and `--skip-slug`, is an error. Hidden agencies are skipped unless named with `--only-slug <slug> --include-hidden`; they stay hidden and only their R2 artifacts are corrected. With `--write`, an agency in a country with no production-visible agencies is skipped, the same country-launch rule `process` and `refresh` apply, unless `--i-am-launching-country` is passed after explicit approval ([#668](https://github.com/Civic-Minds/Atlas/issues/668)).

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

## Running it on GitHub Actions

The same sequence runs in the cloud, so a full rebuild does not need a laptop. The `Rebuild data release` workflow (`.github/workflows/rebuild-release.yml`) is manual only and uses the same R2 secrets as `refresh-feeds.yml`. It runs once it is on main.

```bash
# Dry run: reprocess + PMTiles dry run. Writes nothing to R2.
gh workflow run rebuild-release.yml -f ref=<branch or SHA> -f mode=dry-run
# Publish: reprocess --write, build-pmtiles, verify, build-history, publish-data-release
gh workflow run rebuild-release.yml -f ref=main -f mode=publish -f allow="communitytransit:drop"
```

- **Inputs:** `ref` (default `main`), `mode` (`dry-run` default, or `publish`), `allow` (space-separated `<slug>:<flag>`, passed to the reprocess and to `publish-data-release`), `concurrency` (agencies in parallel, 1-4, default 2), `start_at` and `resume_run_id` (publish only, see Resuming).
- **Dry run:** runs the code of any branch, so it never sees a write-capable credential. It uses a read-only R2 token (repository secrets `R2_RO_ACCESS_KEY_ID` and `R2_RO_SECRET_ACCESS_KEY`: an R2 API token with Object Read only, scoped to the data and archive buckets) and a read-only GitHub token with no stored login. It fails at the start, with a message, if those two secrets are missing. It uploads `tmp/derived-reprocess/report.json` and the release diff (`tmp/release-diff/*.md`, `*.json`) as the `rebuild-report-dry-run-*` artifact. Read it before publishing, then repeat each reviewed `--allow` in the publish run. Refused agencies are a normal outcome (the reprocess exits 1 when any is refused): the run still builds the PMTiles dry run and uploads the report, and fails only on a crash or an agency with status `failed`. The job summary lists processed, refused (with reasons), failed and the red release gate flags.
- **Publish:** a separate job with the write keys. It refuses unless `ref` is the current tip of main. It opens the same two small pull requests the weekly refresh does (feed expiry stamps, agency pages) and auto-merges the agency pages one. Agencies the reprocess refuses (expired or older-than-live zip, or a release gate flag such as GRT mode-lost) are a normal outcome, as in the dry run: they keep their live data, and a run where every agency was written or refused goes on to the tiles. A real error (a crash with no report, or an agency with status `failed`) still stops the run before any tiles are built; the expiry stamps still go into their pull request either way. The job summary lists written, refused (with reasons) and failed.
- **No overlap:** it shares the `atlas-data-release` concurrency group with the weekly refresh, so the two queue behind each other and never run at once. Do not start a publish run close to Monday 06:00 UTC.
- **Time:** one job with a 345 minute limit (GitHub's cap is 360). The last local full run was about 55 minutes of reprocess plus the tile build; the tile build and history timings on a runner are not measured yet.

### Resuming a publish run

The runner is thrown away at the end of a run, so a run saves what a later stage needs as artifacts (kept 14 days): `rebuild-stamps-<run id>` (the feed expiry stamps and the commit) and `rebuild-manifest-<run id>` (the release manifest that `verify-pmtiles-remote` and `publish-data-release` read, and the commit). To resume, run again with `mode=publish`, `ref=main`, `start_at` and `resume_run_id=<the earlier run id>`:

| `start_at` | Starts at | Needs | Notes |
|---|---|---|---|
| `reprocess` | the beginning | nothing | Rewrites every agency's artifacts in R2. |
| `pmtiles` | `build-pmtiles` | optional `resume_run_id` (for the stamps) | Agency artifacts are already in R2. Builds a new release id each time; an unpublished one is just an unused upload. |
| `history` | `build-history` | `resume_run_id` of a run that finished `build-pmtiles` | Reuses that run's release manifest. |
| `publish` | `publish-data-release` | `resume_run_id` of a run that finished `build-pmtiles` | Reuses that run's manifest. |

A resume refuses when main has moved past the commit the earlier run built, because the manifest and the stamps belong to that build; start again from `reprocess` then. Not every stage is free to repeat: `build-history` writes `atlas/history-config.json` to the live bucket as soon as it runs, before the release is published.

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
| `route-shift` | yellow | Any single route, whatever the agency's size: its weekday tier moves 2 or more steps (for example infrequent to 30), or its median weekday headway halves or doubles. Catches one wrong route at a small agency, which `headway-shift` never reaches ([#707](https://github.com/Civic-Minds/Atlas/issues/707)). Not reported when `headway-shift` already fires for the agency. A second message lists routes that existed live with only weekend lines and now run on weekdays, so a wrong headway on newly weekday service is reviewed too ([#714](https://github.com/Civic-Minds/Atlas/issues/714)). Tiers off the headway scale (`span`, legacy rail `5`) never count as a change. Yellow because real schedule changes trip it too (29 agencies, 59 routes on the 2026-10-11 dry run), so review each listed route before publishing. |
| `headway-lost` | red | At least 75% of an agency's live weekday route/directions that had a headway (and at least 3 of them) still run on weekdays but have no headway now, so they drop out of every weekday frequency filter. Compared per route and direction. Typical cause: a pipeline change showing full Mon-Fri routes as limited ([#710](https://github.com/Civic-Minds/Atlas/issues/710)); on the 2026-10-11 dry run lanta, lancaster and seattle-streetcar were at 100% and the next highest real case at 50%. |
| `headway-lost` | yellow | A smaller share: one route/direction losing its weekday headway, whatever the agency's size. Real partial-weekday routes (Friday-only, one-day-a-week) trip it too, so check each listed route. Route/directions dropped outright are left to `drop`. |
| `day-lost` | red | A day type (Weekday, Saturday or Sunday) had route lines live and has none in the new output, for example all weekend service gone ([#741](https://github.com/Civic-Minds/Atlas/issues/741)). Typical cause: a reference week whose weekend is wiped by holiday exceptions; on the 2026-10-12 bundle dry run clallamtransit and raba lost Saturday and Sunday this way. A real seasonal end (summer weekend shuttles) trips it too: accept it with `--allow <slug>:day-lost` after review. Not reported when the output is `empty`. |
| `day-shrunk` | yellow | A day type's route lines fall below 65% of live, with at least 5 live. On the 2026-10-12 bundle dry run this caught cdta Saturday 92 to 56 (Albany routes missing) and nyc-ferry's summer weekend routes ending (21 to 13); every other day type stayed at 72% or more. |
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

