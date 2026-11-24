import { describe, expect, it } from 'vitest';
import { liveSlotKey, slotOf, slotsBack, slotsInRun } from '../liveSlots';

/** Every poll an hour of minute cron runs makes for a feed. */
const hourOfPolls = (paceSec: number, start = 1_795_000_020) => {
  const polls: number[] = [];
  for (let run = start; run < start + 3600; run += 60) polls.push(...slotsInRun(run, paceSec));
  return polls;
};

describe('live recorder slots (CIV-2073)', () => {
  it('a 90 s feed polls 40 times an hour and a 30 s feed 120, each on a boundary, none twice', () => {
    for (const [pace, n] of [[90, 40], [30, 120], [60, 60]] as const) {
      const polls = hourOfPolls(pace);
      expect(polls).toHaveLength(n);
      expect(new Set(polls).size).toBe(n);
      expect(polls.every(t => t % pace === 0)).toBe(true);
    }
  });

  it('keys a slot by its UTC date and time; a reader steps back slot by slot', () => {
    expect(liveSlotKey('hamilton', 1_795_000_020)).toBe('live/hamilton/2026-11-18/1795000020.json');
    expect(slotOf(1_795_000_049, 30)).toBe(1_795_000_020);
    expect(slotsBack(1_795_000_049, 1_794_999_960, 30)).toEqual([1_795_000_020, 1_794_999_990, 1_794_999_960]);
  });
});
