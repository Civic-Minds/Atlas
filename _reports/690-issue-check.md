# Open issues against the #690 branch (53025ff7)

Evidence: catalog scans in the 1419e250 scratchpad, main = current main (out/main690b), branch = out/fix690j
(53025ff7); per-stop values from the branch dumps (out/stops-g5). No new scans. Numbers are headline/tier,
with period values where they matter.

| Issue | Status | Evidence (main -> branch) |
|---|---|---|
| #841 TTC 39 Sunday branch vs trunk | Not fixed, by decision | Finch headline 16/20 -> 16/20; trunk stops read 8 on the branch (pooled), periods read the branch's own 16 (main's periods read the pool: 8). The 2026-10-13 decision keeps the headline as the branch's own service (ttc 94 precedent). |
| #813 evenness guard | Not fixed | TTC 24 Steeles reads 10 at Victoria Park & Crescent Town (8443) before and after the #851 grace, Don Mills via Consumers 24; the 14-minute gap on a 7-minute merged list is past the grace (7 + 5). |
| #810 headline on an undrawn tail | Not fixed, by decision | Issue records the 2026-10-13 decision to leave the headline; the branch's stop tiers now drag the tier instead (route tier = worst graded stop), the headline is unchanged. |
| #771 TriMet 35 alternating shapes | Not fixed | Oregon City 61/infrequent -> 60/infrequent; periods 28-30 on main (headsign pool) -> 60-62 on the branch (own shape). Worse on the branch; see note below. |
| #760 WestCAT 16 loop | Fixed on main already | 37/60 on both main and branch (issue reports infrequent on release-mv5ilv73). Closeable without the branch. |
| #756 WMATA Yellow weekend | Not fixed | Greenbelt Saturday/Sunday 16/30 -> 16/30 (trains every 8). |
| #755 Valley Metro 170 / 72 | Not fixed | 170 Saturday Northsight 59/infrequent -> 60/infrequent, periods 30 -> 59-63 (same shape as #771); 72 Sunday Thompson Pk 30/60 -> 30/60. |
| #754 Knoxville 41 Sunday | Not fixed | Bay F and Bay P 60/60 -> 60/60 (each pattern on its own). |
| #736 shared stretches | Fixed | TTC 29 both directions and 39 Finch: every shared-trunk stop reads 8 on the branch (each branch 16 on main); sharedStretches published on the Exhibition lines; headline stays the branch's own 16 by decision. |
| #728 far-terminal frequent periods | Partly, on main | The #728 lift (liftTierOnDestinationPool) shipped in 3.3.0; the far-terminal sustained check itself is unchanged on the branch. |
| #602 TransLink 99 AM | Not fixed | Boundary Loop AM 23 -> 23, worst-direction AM coverage 38 on both; Commercial-Broadway AM not sustained on both. |
| #554 Omaha ORBT AM | Fixed on main already | Weekday AM 10 with coverage 10 on both main and branch (issue reported coverage 20). Closeable without the branch. |

Fixes lines for the #690 merge: Fixes #736. (#760 and #554 are already fixed on main and can be closed now;
nothing on the branch changes them.)

Note for review: on lines whose destination is served by two alternating shapes (TriMet 35 to Oregon City,
Valley Metro 170 Saturday, TTC 29 Wilson, TTC 39 Finch), main's period values read the headsign pool (every 30 /
every 8) while the branch's periods follow the own-shape headline (60 / 16). That has been so since the first
branch scan (898b5135): the branch makes periods agree with the headline, which the decision says is the
branch's own service. Riders at Oregon City get a bus every 30; the card will say 60 at every period. Worth a
word with Ryan before merge.
