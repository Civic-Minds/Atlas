import { describe, expect, it } from 'vitest';
import { medianHeadwayInWindow, resolveTerminalHeadway } from '../headway-utils';

describe('medianHeadwayInWindow', () => {
  it('does not expose a sparse two-departure cluster as an hourly headway', () => {
    expect(medianHeadwayInWindow([13 * 60 + 20, 13 * 60 + 30], 13 * 60, 14 * 60 + 30, 3)).toBeNull();
  });

  it('keeps a real three-departure service pattern', () => {
    expect(medianHeadwayInWindow([13 * 60, 13 * 60 + 30, 14 * 60], 13 * 60, 14 * 60 + 30, 3)).toBe(30);
  });
});

describe('resolveTerminalHeadway', () => {
  // TTC 35 (shared terminal, well-sampled): terminal-computed value is the combined frequency
  // of multiple routes converging on the same stop, which looks better than this branch's real
  // frequency. With a well-sampled branchHw, the ratchet must protect it.
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
