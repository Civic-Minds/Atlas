# CIV-845 stop-value evenness study (2026-10 to 2026-11)

Evidence archive for GitHub #1086 (CIV-845, CIV-1957, CIV-1959): when a stop's pooled value should be shown, refused, or smoothed. This folder holds the replay scripts and small summary outputs behind the "Everything tried" log. It is evidence, not a decision record.

- Full log of what was tried and rejected: https://github.com/Civic-Minds/Atlas/issues/1086#issuecomment-7020988046
- Base commit: `6af657cb6` (origin/main at the time). Candidate (CIV-1957, unrounded value in the 1.6 x value clause): `0437649cc`.
- Prototype commits kept as local branches (not pushed): `archive/civ845-4c11092`, `archive/civ845-f0b15e9`, `archive/civ845-922f66a`, `archive/civ845-3b21182`.

## Not runnable as-is

Nothing here was rewritten. The scripts were written in a scratchpad and use absolute paths:

- `/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/{headway-utils,stopPools}.ts` for the code under test (28 scripts). Run from a checkout of the base commit, or point them at a snapshot.
- `/private/tmp/claude-501/.../scratchpad/...` for feeds and data (`drt/`, `ttc*/`, `live/`, `snap/`). These folders are deliberately not archived (GTFS feeds, release JSON, probe logs). Re-create them from the feeds listed below.
- Some import from deleted worktrees (`.claude/worktrees/agent-ae871fec4ff3b70e0`, `agent-a92708b45d34993ae`, for example `step*.ts`, `ripple*.ts`, `blip*.ts`): the paths need editing to the current checkout.
- `mr.ts` and `an.ts` (and the copies in `civ1959/`) need `snap/main` and `snap/branch` (plus `main155`, `main15`, `main14`): source snapshots of `6af657cb6` and `0437649cc`, with only `POOLED_MAX_GAP_TYPICAL_RATIO` edited in the ratio copies.
- `v0/replay.ts` reads `tmp/agency-pages-cache/release-mwl8qwjk/drt.json` and `v0/drt.json` / `ttc.json` (not archived).
- `ux-a4-fracG/` is a separate scratchpad set (the A4 "fracG" seconds-precision replay). It imports `./realx.ts` and `./s1lib.ts`. Its `s1lib.ts`, `s1runA3.ts` and `s3c.ts` share names with files in `scripts/`, so it has its own folder. Its outputs were not saved.

## Inputs and pins

- DRT feed `20261129-fresh.zip`, service date 2026-11-18 (calendar 2026-10-19 to 11-29).
- TTC feeds `20261031` and `20261221` (replays use Wed 2026-10-21 and Sat 2026-10-24).
- HSR `_feeds/hamilton/20261226-fresh.zip`, date 2026-11-18.
- Pinned run time: `ATLAS_RUN_AT=2026-11-19T12:00:00Z`. The 22-agency dry run used runAt 2026-11-19T18:27:09Z on both sides.

## Command pattern

From the repo root, one job at a time: `nice -n 15 node_modules/.bin/tsx <file> [args]`. Python files: `python3 -I <file>`.

## Contents

`scripts/` replay and experiment scripts; `*lib.ts` are shared helpers imported by the numbered runners.
- `mr.ts` majority-refuse harness (SET=base12|wide|pin|hsr|marg, VARIANTS=..., OUTD=...); `an.ts` analysis of its output; `wb.ts` DRT 900 WB stops 34-42 gap listing; `mixed.py` sections still mixing pass and refused. `runall.sh` and `runall2.sh` re-run everything.
- `step1*.ts`, `s1*.ts`: seconds-precision A1/A2/A3 (`tsx step1run.ts`, `tsx s1runA3.ts`, `tsx s1bA3.ts`). `s1S.ts` (smoothing) is not archived.
- `step2*.ts`, `ripple*.ts`, `s3*.ts`: same-trips and R1 to R4 anchor rules (R3 is the middle-stop anchor).
- `step3.ts`, `step4.ts`, `s4A3.ts`: neighbour-blend and neighbour-colour rules.
- `blip*.ts`, `var.ts`, `rule.ts`: blip fill, median/margin variants, one-stop stretch rules.
- `s2c.ts`, `s5*.ts`, `s6*.ts`: display-only and unrounded-value variants (V1, Va, Va2, Vb, Vc; `tsx s6run.ts`).
- `real.ts`, `realx.ts`, `replay.ts`, `all.ts`, `gt.ts`, `val.ts`, `d90*.ts`, `r900*.ts`, `run900.ts`, `ebd.ts`, `tier.ts`, `p.ts`, `a/b/c.mjs`: loaders and one-off probes.

`outputs/` summary outputs from the 2026-11-19 re-run (`*.out`, `out_summary.txt`, `out_mixed.txt`, `out_wb.txt`) and the first-run outputs (`r_out.txt`, `r2_*.txt`, `t102.out`, `civ1957-stopPools.diff`).

`original-scratch-README.md` the original scratchpad README (commands and headline numbers per rejected rule).

`dryrun-diff/` CIV-1957 22-agency stop-level dry run, base vs candidate.
- `compare.ts` the comparer; `patch-probe*.mjs` probes.
- `civ-1957-stops-pair.md` full report (5,566 changed cells: 5,484 stop cells plus 82 route-level cells, see below); `civ-1957-vs-baseline.md` route-level report (42 cells); `test-baseline-vs-1934.md`; `civ-1957-nine-cells.md` trace of the nine previously untraced cells.
- `civ-1957-change-list-final.csv` and `civ-1957-all-changed-stop-cells.csv`: the 5,484 changed stop cells, one per row. `civ-1957-all-gate-flips.csv`: the 9,471 gate flips.

`civ1959/` CIV-1959 candidates (exact-mean clause, display D): `mr.ts`, `an.ts`, `eff.ts`, `fixtures.ts`, `run.sh`, `an_*.txt` outputs, and the drafted comments (`github-*.md`, `linear-proposal.md`).

`v0/` the #1093 V0 attempt replays (`replay.ts`, `count.ts`, `patch.py`, `drt900.ts`, `ttc86.ts`, `dbg.ts`, outputs). The attempt is commit `a86c06531` on `v0-end-stop-display-1093`; the older conflicting one is `2b698d123`.

`tcalc/` the t2 to t4 calculation scripts (Python).

## Count reconciliation

The 5,566 in `civ-1957-stops-pair.md` counts every changed cell (figures, headlines, stops). The CSV has the 5,484 stop-period cells (3,545 headway plus 1,939 coverage). The other 82 are route-level cells: lacmta 16, cta 25, ttc 18, translink 5, pace-bus 13, kingcountymetro 5.
