# Per-attempt #1086 comment drafts (not posted; the coordinator posts)

## 1. Exact-mean 1.5 / 1.55 clause (replayed 2026-11-19)
Changed: the 1.75 x mean clause becomes R x exact mean (R 1.5 or 1.55, grace round(mean)+5 kept); value clause untouched. Close cousin of the "Lowering the 1.6 ratio" row, not a new idea.
Numbers (changed / real frequent dropped): 12 cases 55/6 (R 1.5), 39/1 (1.55); pin 16/2 and 3/1; TTC 52 marg 0/0; HSR 05 122/0 and 92/0; 112 windows 96/10 and 66/5. All five pinned unit fixtures pass.
Verdict: R 1.5 makes DRT 900 east and west one reading (24) and fixes WB 34-42, but moves 14 DRT 900 midday stops 12 to 24 and drops 10 real frequent stops in 112 windows. 1.55 leaves east patched. Rejected. Files: scratchpad civ1959/an_c_summary.txt, github-appendix.md (Replay A).

## 2. Display D: refused stop always shows pooled worst wait (replayed)
Changed: a refused stop never reads its own list; it shows the pooled list's longest wait. Numbers: pin set 44 stops change, all refused TTC 41 Saturday midday stops 8 to 14. Verdict: breaks the TTC 41 Saturday pin; rejected. Lesson: the own list is correct when thick; the damage is only when it is thin.

## 3. Thin-list fallback estimate (not a replay)
Of the 481 CIV-1957 readings that moved over an hour, 354 (74%) had 5 or fewer own trips (caveat: ownDeps column has 24 zeros). A minimum own-trip count before the own-list swap would remove most; proposed as candidate 1 for CIV-1959.

## 4. Rider-weighted gap on DRT 900 evening (partial replay)
Value = sum(g^2)/sum(g). East 16.8-18.7, west 17.7-19.4 across every pooled stop, including stops 34-42 (18.1-18.5) and the stops refused today. One reading per section. RTC 219's 15/15/30 would read 22.5 vs 20 (pin moves). Other sets not run.
