import { describe, expect, it } from 'vitest';
import { adaptiveMedianHeadwayInWindow, hasGenuineBranchPattern, hasSustainedNightService, medianHeadwayInWindow, resolveTerminalHeadway, resolveTerminalPeriodHeadway, sustainedMedianHeadwayInWindow } from '../headway-utils';

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
