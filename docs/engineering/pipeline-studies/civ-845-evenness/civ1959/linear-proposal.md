**CIV-1959: one definition of "even enough" (proposal; nothing built or posted)**

**Problem**
- Neighbouring stops of one bus section get different colours: the test sits on a knife edge (DRT 900 east, longest wait 24 everywhere, limit 22.4, 24 or 25.6 by rounding).
- A failing stop swaps to the single pattern's own list; with few trips the number goes wild (M101 stop 404092: 16 to 215; 481 readings moved over an hour in the CIV-1957 run).
- DRT 900 west stops 34-42 show 16-17 where riders wait 24-25.
- Patches already tried and rejected (#1086): lower ratio, majority-refuse, median, blip fill and more.

**Candidates**
1. **Fix the fallback only** (not tried before). Keep today's test. A refused stop never swaps to an own list with too few trips; it shows its pooled worst wait. Trip minimum chosen from the logged flips (74% of the 481 big swings had 5 or fewer own trips).
2. **Tighter test on the exact average gap** (cousin of the rejected "lower the ratio"; replayed now). Limit 1.5 times the exact average; pinned fixtures still pass.
3. **Graded value** (not tried before). Show the rider-weighted gap instead of the typical gap, so no cliff. Today's test stays only for gross holes.

**Scoring** (four Done-when lines)
| | 1 one reading | 2 no overstating | 3 pins | 4 dry run |
|---|---|---|---|---|
| 1 | not met | not met | likely met | unknown |
| 2 | met on DRT 900 | met, WB 34-42 included | fixtures met; 14 DRT 900 midday stops 12 to 24 | unknown |
| 3 | met on DRT 900 evening (east 17-19, west 18-19) | partly (18 shown, longest 25) | RTC 219 moves about 20 to 23 | unknown |

**Cost**
- 1: no rule numbers change; removes most big swings; low risk.
- 2: 1.75 becomes 1.5. 112 windows: 96 stops change, 10 real frequent stops dropped, 76 overstaters removed.
- 3: every uneven pooled stop changes (size unknown), the number's meaning changes, RTC 219 is re-pinned.
- All need the six-agency, two-country dry run.

**Recommendation:** ship 1 first; replay 3 on the 12 cases before touching the test. 2 drops real stops.

**Your decision:** what should a pooled stop's number mean when service is uneven?
1. Rider-weighted gap (Recommended; I replay it first)
2. Typical gap, tighter test (accept about 10 dropped frequent stops per 112 windows)
3. Today's meaning; fallback fix only
