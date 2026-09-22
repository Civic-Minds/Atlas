# Performance benchmark

This is the repeatable record for comparing the live public Atlas build with a
local candidate. It is not a claim that Atlas is faster until the results are
recorded under the same conditions.

## Targets

- **Public baseline:** the commit currently deployed at `www.transitatlas.fyi`.
- **Candidate:** the local production build being evaluated.
- Use the same map URL, browser, device, viewport, and feature settings for both.

## Test procedure

Run at least 10 loads per target on each network: five cold loads and five warm
reloads. Record the median, p75, and p95 for each target. Do not use the fastest
single run as the headline result.

The primary endpoint is **initial map complete**: every line needed for the
initial viewport has loaded and been rendered. Browser document-load time is a
secondary metric because Atlas loads map data asynchronously after the document
finishes loading.

Record the date, network label, device, browser, map URL, connection speed, and
latency beside each run. Keep cold-cache and warm-cache results separate.

## Local runner

The committed runner uses the same three URLs, a fixed 1440×900 viewport, a
fresh browser context for cold runs, and a reused context for warm runs. It
waits for Atlas's `network-data-ready` signal and for the loading badge to
disappear, or records a timeout.

```bash
npm run benchmark -- --target http://localhost:5100 --network "59 cecil wifi nov 2025"
```

Useful options are `--runs 5`, `--scenario ottawa-city`, `--timeout 60000`,
`--headed`, and `--output reports/benchmarks/home.json`. Reports are local
artifacts and should not be committed as application source.

## Current baseline setup

- Live public deployment: `www.transitatlas.fyi`, deployment commit verified as
  `e642ce2f` on 2026-09-22.
- Clean baseline worktree: `Atlas-worktrees/public-baseline`.
- Local public-style candidate should use `VITE_ATLAS_MODE=public` and
  `VITE_BETA_BUILD=false`.
- First recorded network: `59 cecil wifi nov 2025`.

The first network snapshot measured 353 Mbps down, 160 Mbps up, 27 ms idle
latency, and 104 ms responsiveness. These values describe the test conditions,
not Atlas itself.

## Reporting

Report the candidate improvement as:

```text
median improvement = baseline median / candidate median
```

Say “median initial-map load improved 2×” only when repeated measurements support
that result. Use real-user monitoring after deployment to see how the result varies
across visitors, devices, and networks.
