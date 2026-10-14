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
Catalog scan of 8e6b68a3 vs main (318 agencies; outputs out/main690, out/fix690g; report690g.py)
found #771's worst-drawn-stop rule producing headlines like 455 (cta J14 Saturday) from a
two-trip tail under segments every 10, and nine lines with no headline for one unvalued drawn
stop. Approved rule (manager, 2026-10-14): a drawn stop without a real all-day reading
(stopHasReading: at least four unique 6-22h departures on the list that serves the stop, no
burst, window or sustained test, so peak bursts like actransit W keep reading) is drawn limited
and left out of the headline and the period floors; the headline reads the terminal plus the
worst stop with a reading; when the terminal has no reading the headline is the worst reading
among the other drawn stops (cta J14 Saturday: the trunk's 10-15, not the two-trip shape's
455); a daytime line with no reading anywhere is limited (headline null; winter-park TL-42,
three trips a day, re-pinned to null). Night routes (under half the departures 6-22h) are
never limited this way. The same applies on the early path for shapes with no own stop value
(two- or three-trip shapes): worst pooled reading, else phase 2's own value if stops have
readings but no published value (saint-john 12), else limited. TriMet 35's two-trip SW 5th &
Alder pattern re-pinned 1140 -> 30 (the trunk's reading) under this rule: a two-trip variant
now shows the service at the stops it shares, which is worth a look in the UI. Checked:
cambus 41 weekday (midday 20 restored), njt-bus 58 Blvd East local weekday (origin tail
hourly, left out: 20), njt-rail Montclair-Boonton M to Hoboken weekday (five peak trips on
five shapes: limited). beeline 5, wrta 24, edmonton A5 keep the midday reading.
Still by design, worth knowing: pooled stop values and merged-window headlines floor at the
mean gap (septa 24 weekday reads 38 where the plain median is 32); period values keep #772's
typicalOfGaps (septa 114 midday period still 81); ttc 63 St Clair (peak-only short turn)
headline 10/infrequent while its segments read the 63's every-7 trunk, which is the design.

Rescan of 28a7bbd1 (scan tree 9eddee6a, same pipeline code) vs main: headway changed on 3,013
of 60,622 lines, tier 212, segments 56,623; report690j.txt in the 1419e250 scratchpad
(out/main690 is main 0c4eb1e8, out/fix690g the branch; report690g.py prints totals, per-agency
counts, None list, 15 biggest moves and the hand-checked lines). 597 lines lost their headline:
402 were one-to-three-trip lines (main headline over 120), 40 were peak expresses main read
from a burst (nfta 60 Buffalo Express 30, pvta 804 11, lanta 410 4, octranspo 663 6, go 52
Hwy 407 30). Manager's call 2026-10-14: peak expresses go limited, no burst allowance
(consistent with the midday-headline standard and #720), so those 40 and njt-bus 58 Blvd East
local's hourly origin tail (20 -> 60 under #771) stay as the rule reads them.

RESOLVED in 898b5135: the J14 family. Cause: a variant's own terminal holds four sparse
departures; the headsign pool declines (a variant's own trips), the thin rescue declines (the
merged list at the terminal is not thin), and Step 4 falls to #772's branch rule on the own
plain values (all 455). Rule: an own terminal sample is sparse when it has fewer than 4 daytime
departures, or fewer than 8 while the pooled list there holds at least twice as many; a sparse
own terminal with no qualifying pool or rescue reads the worst pooled reading among the drawn
stops (cta J14 Saturday 455 -> 10, omahametro 5529 weekday 353 -> 15, nyct-brooklyn B7 Sunday
475 -> 30 on fixtures: scratchpad ca2ba197 fx-j14, fx-omahametro-5529, fx-nyct-bus-brooklyn-B7).
Tier stays phase 2's (only degrades), so J14 shows "every 10" with tier infrequent; the #728
lift needs the headsign pool, which a variant does not have. Worth a look. Peak-only variants
with 4+ own departures are not sparse and read their own all-day fallback or the trunk: mta-
maryland 11663 Federal Hill 5 -> 41 (AM peak 5, 8 stops), mbta 134 Middlesex Ave 13 -> 56
(midday period 13 under a 56 headline: look at this one), septa 1 Decatur-Drummond 31 -> 103,
cincinnatimetro 37 via Jonathan 13 -> 40. njt-bus 29 could not be cut into a fixture
(calendar_dates-only feed; mkfixture.py needs calendar.txt).
Earlier note, kept for the record: the 15 biggest moves were untouched by the #771 change: omahametro 5529
weekday 15 -> 353, cta J14 Saturday 25 -> 455, nyct-brooklyn B7 Sunday 35 -> 475, njt-rail 3
(BNTNM) to Hoboken 43 -> 366, njt-bus 29 weekday 56 -> 423, translink 6727 31 -> 227, pace 807
48 -> 321, mtd BRONZE 35 -> 179, dart 8156 77 -> 242, plus mta-maryland 11663 5 -> 41, mbta 134
13 -> 56, septa 1 31 -> 103, cincinnatimetro 37 13 -> 40. Shape: the midday period reads the
pool (10-30) while the headline is a sparse own value (J14 and 5529 confirmed by hand as
two- or three-trip long shapes past an every-10/15 trunk). They are on neither path changed
so far (Step 4 decideHeadline; the no-own-stop-value early path), so a third path sets the
headline. Plan: fixture with mkfixture.py (scratchpad ca2ba197: `python3 mkfixture.py <feed
dir> <out dir> J14 saturday`; cta zip in the 1419e250 scratchpad zips/cta), trace it, apply
the same rule there (a sparse own value never sets the headline over a pool reading; nothing
qualifying = limited), rescan, re-check the list above.

DECISION (manager, 2026-10-14 02:10): "limited" means no real midday reading. A drawn stop has
a reading only when its list has at least 4 unique departures spread through 9-15h; a variant
whose own terminal has none goes limited, rail included (drop the railFeature exclusion, after
checking njt-rail 3 goes limited and an all-day rail line on another agency does not change).
Settles njt-rail 3, pace 807, mta-maryland 11663, mbta 134 (also check why its midday period
reads 13 under a 56 headline), cincinnati 37/24, septa 1, fairfax 334, sct 6892, go 18J,
njt-bus 74 and 29. Then rescan (chain690j.sh in the 1419e250 scratchpad, tree trees/fix690g
checked out at the commit; report690g.py) and report the same tables.

ATTEMPT at the midday-reading decision (not committed; patch in pool-690/tmp/midday-limited.patch,
apply with `git apply tmp/midday-limited.patch`): stopHasReading = at least 4 unique departures
9-15h spread past a burst (90 min), on the merged list; own terminal likewise; rail included.
Typecheck clean. What it does, so the next session can decide the scope before re-running:
- Suite: 5 failures to re-pin or rethink. Saint John 12 weekday (6 trips, 4-hour midday holes)
  reads no headline; capmetro 550 weekday (2 midday departures at its terminal) reads no
  headline instead of the Downtown pool's 34, which suggests the pool pre-check must not need a
  midday reading of the own list; Basin Transit 1 Saturday Yucca Valley direction loses its 90
  (4 midday departures, so the burst test or the pooled list is the cause); clemson TL-24's
  Saturday-night-tail filter check flips (previous-night-tail.test.ts:92).
- njt-rail processed locally vs main: 20 lines change. Montclair-Boonton M to Hoboken reads 60,
  not limited: its own terminal has no midday reading but the merged list at Newark Broad St
  has one, and the J14 rule then reads the worst pooled stop reading (60). Under the decision as
  worded it should be limited, which means the J14 rule must apply only when the own pattern is
  not peak-only, or J14 (own terminal four trips, one or two at midday) goes limited too. Decide
  which. Also: HBLR 4 Danforth 86 -> 20, 8th Street 23 -> 20 (pooled across headsigns), Port
  Jervis 6 weekday 36 -> limited, RVL/NLR 13 7 -> 10, Raritan 16 to Newark 64 -> limited (tier
  60), Saturday lines with 2-hourly service (120) go limited. NEC 10 to New York unchanged (20).
- metra vs main: 17 lines change: weekend 2-hourly lines (120) go limited; MD-N Fox Lake and
  Grayslake 120 -> 62, UP-N Winnetka 294 -> 60, UP-NW 150/300 -> 120 (pooled station readings);
  HC and NCS to Chicago Union (peak-only) go limited. BNSF unchanged (60).
- mbta 134 Middlesex Ave: midday period 13 under a 56 headline is the own terminal's PM/all-day
  reading over pooled stop periods; with the decision it goes limited. Not root-caused further.
The literal decision turns every 2-hourly or peak-only rail line and every 6-trip bus line into
"limited" (no headline); the scan before it already had 596 such lines. Confirm that scope with
Ryan before rescanning.

DECISION, narrowed (manager, 2026-10-14 02:40): the midday rule applies only to variants
(short-turns, peak branches) of lines that have midday service elsewhere, i.e. a pattern whose
own terminal has no midday reading while another pattern of the same route and direction does.
Such a variant is limited (no headline). A line with no midday variant anywhere keeps today's
reading: a route every two hours all day is real all-day service, not "limited", and so are
peak-only lines with no all-day sibling. Rail included on the same terms. This settles
njt-rail 3 (Montclair-Boonton M to Hoboken: the all-day Montclair-Boonton line is its sibling),
pace 807, mta-maryland 11663, mbta 134, cincinnati 37/24, septa 1, fairfax 334, sct 6892, go
18J, njt-bus 74 and 29 as limited, and leaves metra's 2-hourly weekend lines, Saint John 12,
Basin 1 and the like as they read today. Apply tmp/midday-limited.patch only in that narrowed
form (the "has a midday sibling" test is new), settle the pins, rescan, report.

APPLIED (2026-10-14, this branch): the narrowed rule is in process-core.ts as middayVariant
(hasMiddayReading: four unique departures 9-15h spread past a burst; the own terminal is read
on the own list and the destination's headsign pool, so a thin shape that won dedupe for an
all-day destination, ttc 96B, is not a variant; siblings come from stopDepsBySharedMember per
route, direction and day; night patterns under half their own departures 6-22h are left alone,
so TriMet 35 SW 5th & Alder keeps 30). The five pins from the literal attempt stay as they
read (none of them has a midday sibling). New pins: septa 114 weekday 95 Industrial Park and
Penn State limited, ttc 129 weekday Steeles (dir 0) limited. Also: origin/main 88e43103 merged
in (CIV-97 tile whitelist keeps segments out of tiles; they are read from agency JSON). Styling
decision (Ryan, 2026-10-14): no dashed or thinner limited style; colour each stretch by its own
frequency tier instead. tmp/midday-limited.patch is superseded.

TIER RULE (manager, 2026-10-14, CIV-152): the route tier is the worst stopTiers grade along
the own pattern (settleTierOnStops in process-core.ts): down whenever a graded stop is worse
than phase 2's origin grade; up only through liftTierOnDestinationPool with every own-pattern
stop graded and the other weekdays agreeing, never past the headline. Stops without an
every-gap grade (no all-day reading, or a hole that breaks the sustained sample) carry no
stopTier and never drag the tier; they refuse a lift. The `segments` property and
segmentsByTier are gone; stopTiers replaces them. Re-pins: RCT 117 loop tier infrequent (the
origin list was padded by each trip's arrival; the stops have a two-hour PM gap), GCRTA 67
dir 0 tier 60 (terminal evening gap), J14 Saturday southbound 20, J14 Madison & Jefferson
stays infrequent (own terminal stop 456 has six trips, no grade, refuses the lift). The
rescan must report tier moves up and down per agency with five hand-checkable examples each.

RESCAN (2026-10-14, branch d626293d = 4f64327e + origin/main d4fbe095, vs that main; 318
agencies, 60,628 lines; scan outputs out/main690b and out/fix690h in the 1419e250 scratchpad,
report690k.py / report690k.txt; per-stop dumps for 12 dense feeds in out/stops-g5 (branch) and
out/stops-pre851 (cb014076, before the #851 grace)). Headline changed on 4,324 lines, tier on
7,854 (766 up, 7,088 down), stopTiers published on 51,000 lines.
- Headlines: 2,197 lines lose theirs (597 at the last rescan). 1,614 of them have a sibling
  line of the same route, direction and day that keeps a headline (the midday-variant rule);
  1,776 of the 2,197 had no midday period on main either. Hand-checked: ttc 86C Sheppard
  Saturday (58 trips, none 9-15h; main read 10 from the Zoo pool), cta 77 Belmont & Octavia
  weekday (27 trips, nine midday arrivals inside 69 minutes, a burst) and Belmont & Central (8
  trips): all three limited, correctly. The 583 without a sibling are the peak expresses and
  one-to-three-trip lines of the earlier rescan (actransit W, arvin, bc-ferries Saturday). No
  line gained a headline. Biggest moves are the known list (pace 807, fairfax 334, go 18J,
  septa 1, beeline 5, wrta 24, njt-bus 58, edmonton A5, cambus Loop) plus lines whose
  1,300-minute own value now reads the pool (lacmta 217 Saturday 1380 -> 15, rtcsnv 4745
  1381 -> 20, njt-bus 150/151 1383 -> 48-75, trimet 12 weekend 1202 -> 15).
- TIER DOWN, 7,088 lines (12% of the catalog), OUTSIDE THE TARGET: 6,779 are one step
  (60 -> infrequent 3,352; 30 -> 60 2,391; 20 -> 30 577; 15 -> 20 352), and in 4,281 of
  them more than half the graded stops carry the worst grade, so it is not one odd stop. Cause:
  the every-gap grader (determineTierWithEdgeGapAllowance, violationPercent 5%, no grace on
  the count of gaps over the tier) was written for origin departures; downstream, running-time
  drift stretches a few gaps one to six minutes past the tier and the stop fails. Hand-checked
  with a per-stop trace: wmata P72 Saturday to Largo, hourly, 13 trips, one 61-minute gap from
  stop 9 on -> 69 of 78 stops "infrequent", tier 60 -> infrequent; ttc 79 weekday westbound,
  branch stops every 30 with gaps 31 and 35 (two over 30 out of 38) -> 60, and one 36-minute gap
  at Runnymede & Foxwell -> 60, tier 30 -> 60; mbta 28 Saturday to Nubian, every 12 at the origin
  (gaps to 15, graded 15), 16-17 minute gaps mid-route -> 20, tier 15 -> 20; septa 38 weekday to
  Market, headline 20, 74 of 75 stops graded 60 (tier 30 -> 60); mbta D Sunday to Union Square,
  every 10, all 50 stops graded 15 (10 -> 15). Per agency: translink 236, wmata 213, njt-bus
  203, metrohouston 198, marta 190, ttc 170, kcm 160, rtd 146, actransit 145, octranspo 141.
  Options for the manager: (a) grade stops with a drift allowance (count a gap as a violation
  only past tier + grace, as the headway's own tier already tolerates), (b) take the tier down
  only when the worst stop is two steps worse than phase 2's grade, or (c) keep the worst-stop
  rule for the section colours only and leave the route tier at phase 2's grade. Not changed on
  the branch; the manager decides.
- TIER UP, 766 lines (infrequent -> 60 343, 60 -> 30 127, infrequent -> 30 104, 30 -> 20 37,
  10 -> 5 30): cta 51, valleymetro 51, njt-bus 41, ttc 39, septa 38, capmetro 32, nyct-bronx 31,
  trimet 31. Hand-checkable: ttc 165 weekday Albion and Weston 15/15 -> 9/10 (pooled trunk
  along the whole line, every stop graded); ttc 54 Sunday Don Valley 15 -> 8/10; septa 52
  Sunday Woodland 24/30 -> 12/20; njt-bus 70 Sunday Paterson local 30/60 -> 30/30 (59 of 59
  stops graded 30); valleymetro 70 weekday Glendale PNR 60/infrequent -> 60/60 (108 stops all
  graded 60); cta 80 Saturday Irving Park & Harlem 702/infrequent -> 13/20 (a thin shape now
  reading its trunk). All lifts needed every own-pattern stop graded and the other weekdays
  agreeing.
- #851 grace, isolated on 12 dense feeds (branch vs cb014076): 1,668 stop values change on
  130 lines, 1,596 gain a pooled value (new or lower), 72 read one or two minutes worse (ttc
  165 weekday 7 -> 8, translink 99 westbound 3 -> 5: the merged mean now passes where the own
  reading stood). New dense pooled values: ttc 52 Sunday both directions 20-25 -> 7-8 at all
  23 Lawrence stops; ttc 29 Sunday 10-16 -> 6 at 39 stops; ttc 85 Sunday 12-16 -> 7 at 43
  stops; ttc 102 Saturday 10 -> 6-7 (headline 10 -> 8); cta 79 Saturday every 7 trunk gains
  6 at 18 stops that had no pooled value; nyct B6 weekday limited 7 -> 5 at 39 stops, B41
  Flatbush limiteds 17 -> 5 at 16 stops; sfmta 30 weekday 12-15 -> 7 at 17 stops; translink
  R-lines/99 B-Line 6-12 -> 3 at 20 stops; njt-bus 1 Jersey City 160 -> 7 along the trunk.
  Six headline and three tier changes from the grace (ttc 165 Finch 17/20 -> 8/10, nyct B6
  weekday 20 -> 15). mbta, septa, wmata, octranspo, stm, metro-transit: no change.
- Scan and merge: #858 merged in (CHANGELOG conflict resolved, main's #852 line kept first);
  typecheck clean; runningTime, stop-tiers, stop-pools, midday-reading and pooled-headline
  real-feed tests pass. Nothing pushed.

RESCAN 2 (2026-10-14, option 3: grader floor f9b5b509 + drawn-sibling midday fix 6266ad13; scan
outputs out/mainG = origin/main 04dfbf95 + f9b5b509 cherry-picked, out/fix690i = branch 6266ad13;
report690l-main.txt and report690l-branch.txt, drift-*.json in the 1419e250 scratchpad).
- Main + grader floor vs the baseline: 1,591 tiers up (infrequent -> 60 1,484; 60 -> 30 86; 30 ->
  20 11; span -> 60 5), none down, 6 headlines move (gcrta 71 weekday 60 -> 47). rtd 78, sdmts 49,
  njt-bus 44, metro-transit 42, thebus 39, via 39: hourly lines over 12-16 gaps with one near miss.
- Branch vs main + grader: tier up 775 (as before), tier down 6,331 (was 7,088): 60 -> infrequent
  2,573 (was 3,352), 30 -> 60 2,409 (unchanged), 20 -> 30 581, 15 -> 20 352. The floor only helps
  the one-near-miss case. Named lines: J14 Saturday southbound 10/15 -> 10/20 (real downstream
  gaps), Madison & Jefferson 25/infrequent -> 10/infrequent, Jefferson & Washington 10/15 kept;
  wmata P72 Saturday 60/60 kept on main and branch; ttc 79 weekday both patterns 30/30 -> 30/60
  (two near misses of 38 gaps, and one 36-minute gap past the 5-minute grace); mbta 28 Saturday
  Ruggles 12/15 -> 12/20 (about ten 16-17 minute gaps over 75, 7 allowed), Nubian 40/60 -> 12/20.
- Why the drops stay (per-stop trace of all tier-down lines on ttc, wmata, mbta, septa; 564
  lines): at the worst stop 223 (40%) have a gap past the grace (a 36 on an every-30, a 70 on an
  hourly), which no allowance count can pass; 341 (60%) fail only on near misses, and of those a
  10% allowance would pass 192, 15% 253, 20% 304 (uncapped by the 3-violation ceiling). Absorbing
  downstream drift with one method means a grace of about 20% and an allowance of about 20% for
  the route grader too, which loosens origin grading on main well past the 1,591 lifts above.
- Headline losses 2,149 (was 2,197): 1,601 midday variants with a drawn sibling that keeps a
  headline, 363 one-to-three-trip lines, 95 peak expresses, 42 lines with no period value on
  main, 38 evening/late-only patterns, 10 still dark with a midday value on main: dayton 06
  weekend (two 2-hourly variants, each 3 midday trips), njt-bus 113 Sunday (two 100-minute
  variants), oakville 71 weekday 38, pvta 804 weekday 11, smat 13X 60, vta 912 Sunday 20. Not
  traced; pvta 804 and vta 912 look wrong and are the ones to check first.
- Tests: full pipeline/api/shared suite passes (1,236 tests); three pins moved for the floor
  (transit-phase2 near-miss tests, RCT 117 weekday tier 60).

## Summary for Ryan (plain language, 2026-10-14)

What changes when this branch goes live (318 agencies, about 60,600 route lines):

1. A route's frequency tier is now the worst stop along its line, not just its first stop. About
   6,300 lines (10%) go down one tier, because buses run a few minutes late on the timetable by
   the time they reach mid-route stops and a 30-minute route shows 31-36 minute gaps there.
   Example: TTC 79 Runnymede westbound shows "every 30" but drops from tier 30 to tier 60,
   because riders at Runnymede and Foxwell wait up to 36 minutes. About 775 lines go up a tier
   because every stop on them pools with a frequent trunk (TTC 165 Albion and Weston: 15 to 10).
2. About 1,500 hourly lines move up from "infrequent" to tier 60 on every agency, because one
   61-minute gap in a 12-hour day no longer fails them. Example: WMATA P72 on Saturday.
3. About 2,150 lines stop showing a number and show as limited service. Three typical cases:
   TTC 86C to Sheppard on Saturday runs only in the rush hours, so it no longer shows "every 10"
   borrowed from the Zoo trips that run all day. CTA 77 buses that short-turn at Octavia run nine
   times in about an hour at midday, so they no longer show "every 10" on their own. NJ Transit
   58's hourly Boulevard East local no longer shows "every 20" taken from the main pattern. The
   rest are one-to-three-trip lines and rush-hour expresses that had a number from a handful of
   trips.
4. Each stop now carries its own tier, so the map can colour a route stretch by stretch
   (behind the segmentColours flag on beta, CIV-152).

## What is left

1. Done: 16 hand checks (ttc 41, 506, 129 wkd, 38, 63, 17, 54, 129 Sun; septa 14, 52, 58, 93,
   114, 24, 128, 55); merge onto main with #746 as its own dedupe step.
2. A catalog scan on the new head (the old scan outputs predate the merge and fixes), then the
   cell diff vs main across the catalog. Hand-check tooling: the scratchpad of session
   ca2ba197 has hc.py (pool per drawn stop from raw GTFS), show.py, celldiff.py.
3. Open decisions for the manager/Ryan: #813 evenness guard (Fable proposed a share-of-window
   rule). Limited-segment styling is decided: colour by frequency tier, no special style.
4. Preview: preview/ui-2026-10-13 carried #690 segment commits (6525c692, 2923bdac) that were
   reverted for the UI ship; the beta segment drawing comes back with this branch.
