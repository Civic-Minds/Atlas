# Resume: #690 per-stop pools and segments (Atlas Data employee chat; updated 2026-10-13 late evening, CIV-150)

Branch fix/pool-every-trip-690, worktree ../Atlas-worktrees/pool-690. Not pushed.
- aac24dba: merge of origin/main (0c4eb1e8) carrying #746 into featureDedupe.ts as Step 3 and
  #745 into decideHeadline; suite 2067/2067.
- next commit (CIV-150): headline fixes + #813 evenness guard + limited segments on thin stops.
  See "CIV-150 findings" below.
Main has moved: 5899e43c (data batch PR #831), 28f11622 (UI release #832), and PR #838
(release/rebuild-2026-10-13: Streamline index entry, ten lastFeedExpiry corrections,
regenerated agency pages and catalogs) was pushed with auto-merge. The data release
release-mv7er2wh is live (built from 4ac2f3f5).

## Catalog chain: complete

All stages finished (out/chain690.ALLDONE5, 318 agencies each). Outputs and logs live in
/private/tmp/claude-501/-Users-ryan/1419e250-d084-4901-9f18-5b31bcefbc1d/scratchpad/
(out/<label>/<slug>.json, logs/drive-<label>.log, analyze690.py). That folder is a session
scratchpad: copy anything worth keeping before relying on it.

analyze690.py results:
- Refactor identity: dedupe refactor (fix690pre vs fix690post), Step 4 (fix690b vs fix690c),
  Step 5 (fix690c vs fix690d): all IDENTICAL.
- #690 effect (fix728main -> fix690pre): 4,287 lines change headline/tier/periods (2,048
  headways), 48,779 segment/stop-only, 4,340 other route-level. Tier moves: infrequent->60 36,
  60->30 29, 60->infrequent 24, 30->20 14, 30->60 14, 20->30 7, 60->20 6.
- #771 worst-stop headline (fix690post -> fix690b): 3,260 headline/period lines, 1,923
  headways, 146 tier moves (30->60 53, 60->infrequent 50, infrequent->60 12).
- #740+#728 on main (base-main -> fix728main): 718 headline/tier lines, 674 tier moves,
  mostly lifts (infrequent->60 348, 60->30 121, infrequent->30 64), 31 drops 60->infrequent.
  This is what shipped in release-mv7er2wh.
- Review fixes A/B 14fc94ad (fix690d -> fix690e): 2,053 lines change period values, 19
  headways, 3 tiers; 7,001 route-level (worstDirection* fields).
- Segment tail 0b16de89 (fix690e -> fix690f): segment-only, 0 headway changes. Every line's
  segments differ only because the format moved from stop indices {from,to} to line
  fractions {start,end}.

## CIV-150 findings (hand checks of fix690f against raw GTFS, then fixes)

Six headlines read numbers the schedule did not contain. Causes and fixes:
- ttc 129 weekday Steeles via STC 20 -> 28: the pool's midday list had a 30-min hole, so its
  midday read null and terminalReading fell through to the pool's all-day value (28). Now the
  own midday (20) is read before the pool's later windows.
- ttc 38 weekday Kennedy via STC 15 -> 7: the #772 plain values at a pooled stop were computed
  on the merged list, so the terminal's "plain 7" beat the branch's 15. Plain values now read
  the own pattern at pooled stops.
- ttc 41 Saturday Keele via Keelesdale 8 -> 10: the pool adds no trips 9-15h, but the merged
  list's mean floor still applied (37 departures, mean 9.7). A pool identical to the own list
  in the window is now read as the own pattern (no floor).
- septa 93 Sunday Norristown 62 -> 79: the pool's mean floor on a list that matched the own
  list in the window; reads 62 with the identical-window rule.
- septa 114 weekday Wawa 120 -> 81: the pool's mean floor again (pool == own list). With the
  identical-window rule the terminal reads #772's typical 81 (gaps 62, 122, 59, a 60/120
  alternation; Basin Transit 1 Saturday pins 60/120/60 -> 80) and the #772 branch rule then
  keeps the branch's 120 because every other drawn stop reads 120, as main does. A thin-window
  guard that forced 120 at the terminal broke the Basin test and was dropped.
- ttc 506 Saturday High Park None: fixed by the #746 merge (the all-day shape now wins dedupe).
#813 as implemented: pooledHeadwayInWindow rejects a merged window when any gap exceeds 1.75x
the mean (as before) or 1.6x the floored pooled value (POOLED_MAX_GAP_TYPICAL_RATIO; 1.6 keeps
a 15/15/30 alternation read at 19). Own windows keep #772's typicalOfGaps unguarded. Segments: a stop with fewer than 4 midday departures is valueless
(limited), so peak-only tails stop grading on 1-3 departures. Tests re-pinned: TTC 94 Castle
Frank back to 19/19, Brandon 23 stays 30, MTA Silver headline 31 -> 29, Freedom M 62/98 ->
60/66 (165-min midday hole: the sustained all-day reading).
Opus review of 6d6b7ff6 (fixed in the next commit): the identical-window rule could make a
stop read worse when one pooled trip landed inside the window, so pooled values are now
capped at the own pattern's reading of the same window instead (stopPools); the headline
pool pre-check passed no own times (ttc 41 could be refused before the fix ran); #745 only
when the own terminal is the headline's source; segments use the headline's all-day rule
(scopedTerminalHeadline on the stop's list) instead of a 4-midday-departure count; the #728
lift ran twice after the merge (inline copy deleted); per-stop period max-gap/coverage/
sustained follow the list the shown value came from; floorAtMean parameter removed. The
pool's PM window needs four departures (a two-gap mean is not a wait) and past it the pool
reads the sustained 6-22h wait capped at the own reading (freedom M 66 -> 69). Five real-feed
fixtures pin the hand counts: ttc-41-saturday-pooled, ttc-129-weekday-pool-hole,
ttc-38-weekday-short-turn, septa-93-sunday, septa-114-weekday
(pooled-headline-real-feeds.test.ts). Fixture extractor: scratchpad mkfixture.py (one
route, one day type, shapes thinned to every 10th point).
Still by design, worth knowing: pooled stop values and merged-window headlines floor at the
mean gap (septa 24 weekday reads 38 where the plain median is 32); period values keep #772's
typicalOfGaps (septa 114 midday period still 81); ttc 63 St Clair (peak-only short turn)
headline 10/infrequent while its segments read the 63's every-7 trunk, which is the design.

## What is left

1. Done: 16 hand checks (ttc 41, 506, 129 wkd, 38, 63, 17, 54, 129 Sun; septa 14, 52, 58, 93,
   114, 24, 128, 55); merge onto main with #746 as its own dedupe step.
2. A catalog scan on the new head (the old scan outputs predate the merge and fixes), then the
   cell diff vs main across the catalog. Hand-check tooling: the scratchpad of session
   ca2ba197 has hc.py (pool per drawn stop from raw GTFS), show.py, celldiff.py.
3. Open decisions for the manager/Ryan: #813 evenness guard (Fable proposed a share-of-window
   rule); dashed style for limited segments (getTierColor('span') equals infrequent) — UI call.
4. Preview: preview/ui-2026-10-13 carried #690 segment commits (6525c692, 2923bdac) that were
   reverted for the UI ship; the beta segment drawing comes back with this branch.
