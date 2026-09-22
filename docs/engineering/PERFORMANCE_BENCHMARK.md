# Performance benchmark

This is the repeatable procedure for comparing the live public Atlas build with
a candidate. It is not a claim that Atlas is faster until the results are
recorded under the same conditions.

## Targets

- **Public baseline:** the commit currently deployed at `www.transitatlas.fyi`.
- **Candidate:** the approved public-safe build being evaluated.
- Use the same map URL, browser, device, viewport, and feature settings for both.
- Do not push the divergent local `main` branch just to run this test.

## Fixed test matrix

Do not change these values between before and after runs. The committed runner
generates the URLs from this table, so do not manually edit them.

| Scenario | Latitude | Longitude | Zoom | URL parameters |
| --- | ---: | ---: | ---: | --- |
| `ottawa-city` | `45.42150` | `-75.69720` | `10.00` | `h=10&p=evening&lat=45.42150&lon=-75.69720&z=10.00` |
| `ontario-region` | `44.37898` | `-76.84144` | `6.00` | `h=10&p=evening&lat=44.37898&lon=-76.84144&z=6.00` |
| `broad` | `44.37898` | `-76.84144` | `3.59` | `h=10&p=evening&lat=44.37898&lon=-76.84144&z=3.59` |

The fixed scenario also keeps the active frequency threshold at `10` and the
period at `evening`. Keep the viewport at 1440×900, use the same browser and
device, and do not change filters, zoom, map position, or browser extensions.

## Test procedure

Run 5 cold loads and 5 warm reloads for every scenario and target on each
network. Record the median, p75, and p95 for each group. Do not use the fastest
single run as the headline result.

Run the sequence in this order:

1. Record the network type, approximate location, device, browser, and time.
2. Run one internet-condition check and record download, upload, idle latency,
   and responsiveness. This describes the test connection, not Atlas.
3. Run the public baseline for all three scenarios.
4. Deploy the approved candidate and wait until the public URL serves it.
5. Repeat the same internet-condition check and benchmark sequence.

Use network labels such as `home-wifi`, `phone-hotspot`, or `library-wifi`.
Do not record the Wi-Fi network name or other unnecessary personal information.

The primary endpoint is **initial map complete**: Atlas’s agency catalog and
the map data needed for the fixed initial viewport have loaded, the loading
badge is gone, and the route count is visible. “Document loaded” is secondary
because Atlas loads map data asynchronously after the document finishes.

The runner’s `network-data-ready` mark is the preferred completion signal. For
older deployments it records the documented legacy fallback signal and labels
the result accordingly. A timeout or failed network load is not a successful
load and must remain visible in the results.

## Local runner

The committed runner uses the same three scenarios, a fixed 1440×900 viewport,
a fresh browser context for cold runs, and a reused context for warm runs. It
waits for Atlas’s `network-data-ready` signal and for the loading badge to
disappear. Older deployed builds without that signal use the visible route
count after loading has settled; otherwise the run is recorded as a timeout.

```bash
npm run benchmark -- --target https://www.transitatlas.fyi --network library-wifi --runs 5 --output reports/benchmarks/public-library.json
```

Useful options are `--scenario ottawa-city`, `--timeout 60000`, and `--headed`.
Reports are detailed local JSON artifacts and remain ignored; copy only the
summarized results into the tracked CSV described below.

For a local public-style candidate, use `VITE_ATLAS_MODE=public` and
`VITE_BETA_BUILD=false`, then run the same command with the local target.

## Results log

Append one row per scenario, target, network, and run group to
[`PERFORMANCE_RESULTS.csv`](PERFORMANCE_RESULTS.csv). Keep baseline and
candidate rows separate. The CSV records summarized results; the matching
ignored JSON report is the detailed evidence for each row.

## Reporting

Report the candidate improvement as:

```text
median improvement = baseline median / candidate median
```

Say “median initial-map load improved 2×” only when repeated measurements support
that result. Use real-user monitoring after deployment to see how the result
varies across visitors, devices, and networks.
