import { describe, expect, it } from 'vitest';
import { adaptiveMedianHeadwayInWindow, computePeriodHeadways, computePeriodMaxGaps, computePeriodSustained, forCrossMidnightWindow, hasGenuineBranchPattern, hasSustainedFrequentService, hasSustainedNightService, isSustainedHeadway, medianHeadwayInWindow, nightServiceDepartureTimes, resolveTerminalHeadway, resolveTerminalPeriodHeadway, sustainedMedianHeadwayInWindow } from '../headway-utils';

describe('medianHeadwayInWindow', () => {
  it('does not expose a sparse two-departure cluster as an hourly headway', () => {
    expect(medianHeadwayInWindow([13 * 60 + 20, 13 * 60 + 30], 13 * 60, 14 * 60 + 30, 3)).toBeNull();
  });

  it('keeps a real three-departure service pattern', () => {
    expect(medianHeadwayInWindow([13 * 60, 13 * 60 + 30, 14 * 60], 13 * 60, 14 * 60 + 30, 3)).toBe(30);
  });

  // Issue #280: 3 departures -> 2 gaps is the floor everywhere minDeps=3 is used, so an
  // even-length gap array is the common case, not an edge case. The true median of two
  // values is their average, not the upper one.
  it('averages the two middle gaps for an even-length gap array instead of taking the upper one', () => {
    expect(medianHeadwayInWindow([13 * 60, 13 * 60 + 10, 13 * 60 + 30], 13 * 60, 14 * 60, 3)).toBe(15);
  });
});

describe('sustainedMedianHeadwayInWindow', () => {
  // Issue #279: Halifax route 330 direction 1, the AI-217 motivating case -- a rush-hour-only
  // commuter express. 9 trips packed into 6:20-8:05am plus one isolated 2:30pm trip. A plain
  // median (see medianHeadwayInWindow) is robust to that single outlier and still reports ~10min,
  // which is exactly the misleading "all-day" number AI-217 was written to prevent. Real GTFS
  // times (minutes since midnight): 6:20, 6:50, 6:55, 7:05, 7:15, 7:30, 7:35, 7:55, 8:05, 14:30.
  it('rejects a peak-cluster-plus-outlier pattern (Halifax 330) instead of reporting the cluster median', () => {
    const times = [380, 410, 415, 425, 435, 450, 455, 475, 485, 870];
    expect(sustainedMedianHeadwayInWindow(times, 360, 1320, 3)).toBeNull();
  });

  // Issue #279: TTC route 32 has real, consistent all-day service (5-15min gaps literally all
  // day) that happens to fall partly outside the midday/PM-peak windows at some stops -- it
  // should NOT be suppressed just because it doesn't fit those fixed hours.
  it('keeps a route with real, evenly-spread all-day service, even with some schedule variation', () => {
    const times: number[] = [];
    for (let t = 360; t <= 1320; t += 10) times.push(t); // consistent 10min service, 6am-10pm
    // a few slower 15min gaps sprinkled in (evening slowdown) -- still nowhere near dominant
    expect(sustainedMedianHeadwayInWindow(times, 360, 1320, 3)).toBe(10);
  });
});

describe('adaptiveMedianHeadwayInWindow', () => {
  // Issue #282: TTC route 10 direction 0, Van Horne, real weekday departures 14:15/14:45/15:15/
  // 15:45 -- a strict 60-min window for hour 14 only catches 14:15 and 14:45 (2 departures),
  // short of the 3-departure minimum. Must still widen to the 90-min window to report the real
  // 30-min service instead of going null.
  it('widens past 60 minutes when the strict hour does not have enough departures on its own', () => {
    const times = [14 * 60 + 15, 14 * 60 + 45, 15 * 60 + 15, 15 * 60 + 45];
    expect(adaptiveMedianHeadwayInWindow(times, 14 * 60, 3)).toBe(30);
  });

  // Issue #282: TTC route 5 direction 1, real weekday AM ramp-up -- 06:00/06:20/06:40 (~20min
  // service), then tightening from 06:48 to every ~4-9min by 07:30+. Both hour 6 and hour 7
  // already clear 3 departures within a strict 60 minutes on their own, so the adaptive window
  // must NOT reach into the neighboring hour and blend the two real, different frequencies.
  it('does not widen into the next hour when the strict hour already has enough departures', () => {
    const hour6 = [6 * 60, 6 * 60 + 20, 6 * 60 + 40];
    const hour7 = [7 * 60 + 6, 7 * 60 + 15, 7 * 60 + 24, 7 * 60 + 32, 7 * 60 + 40, 7 * 60 + 48, 7 * 60 + 56];
    const times = [...hour6, ...hour7];
    expect(adaptiveMedianHeadwayInWindow(times, 6 * 60, 3)).toBe(20);
    expect(adaptiveMedianHeadwayInWindow(times, 7 * 60, 3)).toBe(8);
  });

  it('still returns null when neither the strict nor the widened window has enough departures', () => {
    expect(adaptiveMedianHeadwayInWindow([13 * 60 + 20, 13 * 60 + 30], 13 * 60, 3)).toBeNull();
  });
});

describe('forCrossMidnightWindow', () => {
  it('leaves departures untouched for a window that does not cross midnight', () => {
    const times = [420, 480, 540];
    expect(forCrossMidnightWindow(times, 1320)).toEqual(times);
  });

  // Issue #297: CTA Red Line real overnight departures are plain-notation (e.g. 2:00am = 120),
  // not GTFS extended notation (>=24:00). A window that crosses midnight (end > 1440) must also
  // catch those via a +1440-shifted copy, or they never land in [start,end] on their own.
  it('adds a +1440-shifted copy of sub-1440 times when the window crosses midnight', () => {
    const times = [120, 260, 480]; // 2:00am, 4:20am, 8:00am
    expect(forCrossMidnightWindow(times, 1800)).toEqual([120, 260, 480, 1560, 1700, 1920]);
  });

  it('does not drop or duplicate a genuine extended-notation departure already in range', () => {
    const times = [1500, 1620]; // 1:00am, 3:00am extended notation
    expect(forCrossMidnightWindow(times, 1800)).toEqual([1500, 1620]);
  });
});

describe('adaptiveMedianHeadwayInWindow — cross-midnight (#297)', () => {
  // CTA Red Line pattern: real 2-4am service encoded in plain notation, zero extended-notation
  // departures. Hour 26 (2am) and 27 (3am) must resolve via the shifted equivalent (120-180,
  // 180-240) since nothing exists in raw [1560,1620]/[1620,1680].
  it('resolves an overnight hour from plain-notation departures with no extended-notation equivalent', () => {
    const times = [120, 132, 144, 156, 168, 180]; // 2:00-3:00am, every 12min, plain notation
    expect(adaptiveMedianHeadwayInWindow(times, 26 * 60, 3)).toBe(12);
  });

  it('still resolves an overnight hour normally when the feed uses extended notation', () => {
    const times = [1560, 1572, 1584, 1596]; // 2:00-2:36am, extended notation
    expect(adaptiveMedianHeadwayInWindow(times, 26 * 60, 3)).toBe(12);
  });

  it('does not fabricate overnight service when there truly is none in either notation', () => {
    const times = [420, 480, 540]; // normal daytime service only
    expect(adaptiveMedianHeadwayInWindow(times, 26 * 60, 3)).toBeNull();
  });
});

describe('resolveTerminalHeadway', () => {
  // Shared terminal (illustrative — well-sampled branch, terminal-computed value is the combined
  // frequency of multiple routes converging on the same stop, which looks better than this
  // branch's real frequency). With a well-sampled branchHw, the ratchet must protect it.
  it('protects a well-sampled branch headway from a falsely-better shared-terminal value', () => {
    expect(resolveTerminalHeadway(10, 15, 60)).toBe(15);
  });

  // Rennes route 55 (Sunday), issue #263: branchHw=121 came from only 4 trips all day and was
  // stale/noisy; every stop including the terminal actually shows 60. The ratchet must not
  // block this correction just because the branch's own number happens to be higher.
  it('lets the terminal-computed value win when the branch headway is too thinly sampled', () => {
    expect(resolveTerminalHeadway(60, 121, 4)).toBe(60);
  });

  it('always prefers the terminal-computed value when it is worse (higher) than the branch, regardless of sample size', () => {
    expect(resolveTerminalHeadway(30, 10, 2)).toBe(30);
    expect(resolveTerminalHeadway(30, 10, 60)).toBe(30);
  });

  it('falls through to the terminal-computed value when there is no branch headway to compare against', () => {
    expect(resolveTerminalHeadway(45, null, 0)).toBe(45);
  });

  it('respects a custom reliability threshold', () => {
    expect(resolveTerminalHeadway(10, 15, 5, 3)).toBe(15);
    expect(resolveTerminalHeadway(10, 15, 2, 3)).toBe(10);
  });
});

describe('hasGenuineBranchPattern', () => {
  // Rennes route 55 (Sunday): every on-shape stop, including the terminal, showed the same
  // 60min headway — a flat, non-branching route. There's no trunk/branch split for the ratchet
  // to protect, so branchHw=121 (whole-day median off only 4 trips) should not be able to win.
  it('is false for a flat route with no real branch (Rennes 55)', () => {
    expect(hasGenuineBranchPattern(60, Array(19).fill(60))).toBe(false);
  });

  // Draguignan route 01 (Saturday, "KOENIG - HOPITAL"): every on-shape stop, terminal included,
  // showed 40min. branchHw=80 came from a whole-day median across a bursty schedule (paired
  // departures then a long gap) — not a real branch either, same flat signature.
  it('is false for a flat route with an irregular but uniform-across-stops schedule (draguignan 01)', () => {
    expect(hasGenuineBranchPattern(40, Array(55).fill(40))).toBe(false);
  });

  // villeneuve-sur-lot route L6: terminal shows a WORSE headway (39) than the rest of the route
  // (30) — the normal "degrades toward the terminus" pattern Step 4 exists to surface. This is
  // not the shared-terminal-inflation scenario (terminal notably BETTER than the rest), so the
  // ratchet has nothing to protect against here either.
  it('is false when the terminal is worse than the rest of the route, not better', () => {
    expect(hasGenuineBranchPattern(39, Array(14).fill(30))).toBe(false);
  });

  // The scenario the ratchet actually exists for: most of the route shows a real branch-specific
  // headway, but the terminal is shared with other routes and shows a notably better (lower)
  // combined frequency — a genuine trunk/branch split.
  it('is true when the terminal is notably better than the rest of the route (shared-terminal case)', () => {
    expect(hasGenuineBranchPattern(10, Array(12).fill(30))).toBe(true);
  });

  it('defaults to true (keep existing protection) when there is not enough data to tell', () => {
    expect(hasGenuineBranchPattern(30, [])).toBe(true);
  });
});

describe('resolveTerminalPeriodHeadway', () => {
  it('uses a branch-scoped terminal value even when it is more frequent', () => {
    expect(resolveTerminalPeriodHeadway(7, 17, true)).toBe(7);
  });

  it('protects a branch from a better unscoped shared-terminal value', () => {
    expect(resolveTerminalPeriodHeadway(7, 17, false)).toBe(17);
  });
});

describe('computePeriodSustained', () => {
  it('flags a cluster tight against one edge of an otherwise-empty window as not sustained (#299)', () => {
    // TTC Line 1 overnight-style case: 3 departures clustered near the tail of the overnight
    // window [1560,1800], nothing else. Internal gaps alone (5, 5) look clean; the 210-minute
    // void between window start and the first departure is what should fail this.
    const result = computePeriodSustained([1770, 1775, 1780]);
    expect(result.overnight).toBe(false);
  });

  it('does not flag a period whose service legitimately starts partway through the window', () => {
    // TTC route 10 AM Peak: 30-min service starting a genuine 60 minutes into the 3-hour
    // [360,540] window. isSustainedHeadway's grace tolerance alone would reject this outright;
    // the boundary-ratio check must be lenient enough not to double-penalize it.
    const result = computePeriodSustained([420, 450, 480, 510, 540]);
    expect(result.amPeak).toBe(true);
  });

  it('still flags a real internal void between two clusters (#281, unchanged)', () => {
    // TTC route 10 midday: gaps [315, 30] already fail isSustainedHeadway's grace tolerance
    // on the internal check alone -- must stay false with the boundary check added.
    const result = computePeriodSustained([
      420, 450, 480, 510, 540, 855, 885, 915, 945, 975, 1005, 1035, 1065, 1095, 1125,
    ]);
    expect(result.midday).toBe(false);
    expect(result.amPeak).toBe(true);
    expect(result.pmPeak).toBe(true);
  });

  it('flags an AM/PM-peak-only branch as not sustained for midday, not just the window edges (#299)', () => {
    // Real TTC route 952 direction 1 (Lawrence) weekday times: a peak-only commuter branch with
    // no midday service at all. Filtered to the midday window [540,900], only the tail of the AM
    // block (543-627) falls inside it -- a clean-looking ~12min internal median with nothing to
    // trip isSustainedHeadway, but a 273-minute trailing void to the window's own end at 900.
    const result = computePeriodSustained([
      435, 447, 459, 471, 483, 495, 507, 519, 531, 543, 555, 567, 579, 591, 603, 615, 627,
      972, 984, 996, 1008, 1020, 1032, 1044, 1056, 1068, 1080, 1092, 1101, 1112, 1123, 1133, 1144,
      1156, 1168, 1180, 1192, 1204,
    ]);
    expect(result.midday).toBe(false);
    expect(result.amPeak).toBe(true);
    expect(result.pmPeak).toBe(true);
  });

  // Issue #297: same overnight service as the computePeriodHeadways test below, but checking
  // that the sustained flag still evaluates correctly against the shifted times (boundary gaps
  // measured against the period's own [start,end], not against where the raw minute value sits).
  it('evaluates sustained correctly for plain-notation overnight service', () => {
    const times: number[] = [];
    for (let t = 120; t <= 360; t += 12) times.push(t); // 2:00-6:00am, 12min, plain notation
    const result = computePeriodSustained(times);
    expect(result.overnight).toBe(true);
  });

  // 2026-08-08: the old grace/violation-count check counted *how many* gaps landed somewhat
  // above the period median, which flagged routes whose frequency legitimately tapers across a
  // multi-hour period even though no single wait was ever bad. Real TTC data hit this constantly.
  it('does not flag a subway direction that legitimately runs faster early in the period than late (real TTC Line 1 evening shape)', () => {
    // Evening [1140,1380]: ~2-3 min headway early, tapering to 4-5 min late. Worst single gap
    // is 5 min against a ~3 min median -- 2 min excess, nowhere near noticeable to a rider.
    const gaps = [
      2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 3, 4, 3, 4, 3, 4, 3, 4, 3, 3, 4, 3, 4, 3,
      4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 4, 3, 5, 5, 5, 5, 5, 5,
      5, 5, 5, 5, 5, 5, 5,
    ];
    const times = [1140];
    for (const g of gaps) times.push(times[times.length - 1] + g);
    const result = computePeriodSustained(times);
    expect(result.evening).toBe(true);
  });

  it('does not flag a bus direction whose worst gap is only a few minutes past its headway (real TTC 45 shape)', () => {
    // AM Peak [360,540]: steady 8-min headway with one 16-min gap -- 8 min excess, still under
    // the 15-min noticeable-wait floor.
    const gaps = [8, 16, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];
    const times = [360];
    for (const g of gaps) times.push(times[times.length - 1] + g);
    const result = computePeriodSustained(times);
    expect(result.amPeak).toBe(true);
  });

  it('still flags a bus direction whose worst gap is a large, noticeable jump past its headway', () => {
    // Same 8-min shape, but one gap balloons to 35 min (27 min excess) -- past the floor.
    const gaps = [8, 35, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8];
    const times = [360];
    for (const g of gaps) times.push(times[times.length - 1] + g);
    const result = computePeriodSustained(times);
    expect(result.amPeak).toBe(false);
  });
});

describe('isSustainedHeadway', () => {
  it('passes when the worst gap is under the noticeable-excess floor', () => {
    expect(isSustainedHeadway([9, 10, 9, 14], 9)).toBe(true); // 14-9=5 excess
  });

  it('fails once the worst gap crosses the noticeable-excess floor', () => {
    expect(isSustainedHeadway([9, 10, 9, 25], 9)).toBe(false); // 25-9=16 excess
  });
});

describe('computePeriodHeadways — cross-midnight (#297)', () => {
  // CTA Red Line pattern: real, sustained 2-4am service with zero extended-notation departures.
  // Before the #297 fix, "late"/"overnight" only checked raw minutes >=1380, so this returned
  // null despite genuine, frequent overnight service existing in the feed.
  it('surfaces late/overnight headways from plain-notation departures', () => {
    const times: number[] = [];
    for (let t = 60; t <= 300; t += 12) times.push(t); // 1:00am-5:00am, every 12min, plain notation
    const result = computePeriodHeadways(times);
    expect(result.late).toBe(12);
    expect(result.overnight).toBe(12);
  });

  it('does not report late/overnight service that does not exist in either notation', () => {
    const times = [420, 480, 540, 600]; // normal daytime only
    const result = computePeriodHeadways(times);
    expect(result.late).toBeNull();
    expect(result.overnight).toBeNull();
  });

  it('is unaffected for a feed already using extended notation correctly', () => {
    const times = [1500, 1512, 1524, 1536]; // 1:00-1:36am, extended notation
    const result = computePeriodHeadways(times);
    expect(result.late).toBe(12);
  });
});

// Window defaults to GTFS minutes 1440-1800 (midnight-6am), maxGap defaults to 60.
describe('hasSustainedNightService', () => {
  it('is true when every gap, including both boundaries, is exactly 60 minutes', () => {
    expect(hasSustainedNightService([1440, 1500, 1560, 1620, 1680, 1740, 1800])).toBe(true);
  });

  it('is false when an internal gap exceeds 60 minutes', () => {
    expect(hasSustainedNightService([1440, 1500, 1620, 1680, 1740, 1800])).toBe(false);
  });

  it('is false when the first departure leaves the start boundary uncovered', () => {
    expect(hasSustainedNightService([1550, 1600, 1650, 1700, 1750, 1800])).toBe(false);
  });

  it('is false when the last departure leaves the end boundary uncovered', () => {
    expect(hasSustainedNightService([1440, 1500, 1560, 1620, 1680, 1700])).toBe(false);
  });

  it('is false with no departures in the window', () => {
    expect(hasSustainedNightService([])).toBe(false);
  });

  it('ignores departures outside the window and dedupes exact duplicates', () => {
    expect(
      hasSustainedNightService([1200, 1440, 1440, 1500, 1560, 1620, 1680, 1740, 1800, 1900]),
    ).toBe(true);
  });

  it('respects custom window and gap parameters', () => {
    expect(hasSustainedNightService([1440, 1470, 1500], 1440, 1500, 30)).toBe(true);
    expect(hasSustainedNightService([1440, 1500], 1440, 1500, 30)).toBe(false);
  });
});

describe('nightServiceDepartureTimes', () => {
  it('shifts plain midnight-to-6am departures into the Night Service window', () => {
    const times = [0, 60, 120, 180, 240, 300];
    expect(nightServiceDepartureTimes(times)).toEqual([0, 60, 120, 180, 240, 300, 1440, 1500, 1560, 1620, 1680, 1740]);
    expect(hasSustainedNightService(nightServiceDepartureTimes(times))).toBe(true);
  });

  it('keeps already-shifted overnight-only departures in the same window', () => {
    const times = [1440, 1500, 1560, 1620, 1680, 1740];
    expect(nightServiceDepartureTimes(undefined, times)).toEqual(times);
    expect(hasSustainedNightService(nightServiceDepartureTimes(undefined, times))).toBe(true);
  });
});

// Window defaults to GTFS minutes 420-1140 (7am-7pm), maxGap defaults to 15. Same boundary-gap
// logic as hasSustainedNightService (shared helper), just a different window/threshold -- see
// docs/DATA_FREQUENT_NETWORK.md for why 7am-7pm/15min was chosen.
describe('hasSustainedFrequentService', () => {
  it('is true when every gap, including both boundaries, is exactly 15 minutes', () => {
    const times: number[] = [];
    for (let t = 420; t <= 1140; t += 15) times.push(t);
    expect(hasSustainedFrequentService(times)).toBe(true);
  });

  it('is false when an internal gap exceeds 15 minutes', () => {
    expect(hasSustainedFrequentService([420, 450, 1140])).toBe(false);
  });

  it('is false when the first departure leaves the 7am boundary uncovered', () => {
    expect(hasSustainedFrequentService([500, 515, 530, 1140])).toBe(false);
  });

  it('is false when the last departure leaves the 7pm boundary uncovered', () => {
    expect(hasSustainedFrequentService([420, 435, 450, 1000])).toBe(false);
  });

  it('is false with no departures in the window', () => {
    expect(hasSustainedFrequentService([])).toBe(false);
  });

  it('ignores departures outside the window and dedupes exact duplicates', () => {
    const times: number[] = [300, 420, 420];
    for (let t = 420; t <= 1140; t += 15) times.push(t);
    times.push(1200);
    expect(hasSustainedFrequentService(times)).toBe(true);
  });

  it('respects custom window and gap parameters', () => {
    expect(hasSustainedFrequentService([420, 430, 440], 420, 440, 10)).toBe(true);
    expect(hasSustainedFrequentService([420, 440], 420, 440, 10)).toBe(false);
  });
});

describe('computePeriodMaxGaps (#281)', () => {
  it('exposes the dominant gap without changing the existing median', () => {
    const times = [
      420, 450, 480, 510, 540, 855, 885, 915, 945, 975, 1005, 1035, 1065, 1095, 1125,
    ];
    expect(computePeriodHeadways(times).midday).toBe(173);
    expect(computePeriodMaxGaps(times).midday).toBe(315);
  });

  it('keeps a gap that crosses a period boundary instead of dropping it', () => {
    const result = computePeriodMaxGaps([840, 915, 945, 975]);
    expect(result.midday).toBe(60); // 8:00–9:15, clipped to the 9:00–15:00 window
    expect(result.pmPeak).toBe(30); // the same gap contributes 15 minutes after 9:00, below 30
  });
});
