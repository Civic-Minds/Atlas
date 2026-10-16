import { describe, expect, it } from 'vitest';
import { agencyYesterday, yesterdayFromV3 } from '../liveYesterday';
import { againstLastWeekday, dayComparedWith, dayText } from '../liveWording';
import type { LiveV3 } from '../liveDashboard';

const day = (late: number, healthy = true) => ({ healthy, days: 1, late: { share: late, n: 100 }, tripTime: null, extraWait: null, bunching: null, delivered: { share: 0.99, seen: 99, notSeen: 1, unknown: 0 }, lateByHour: [{ hour: 8, n: 20, lateShare: late }] });
const v3 = { daily: { '2026-10-08': day(0.09), '2026-10-09': day(0.05), '2026-10-12': day(0.07, false), '2026-10-15': day(0.12) } } as unknown as LiveV3;

describe('yesterdayFromV3', () => {
  it('compares the latest day with the same weekday a week before, shaped like the weekly block', () => {
    const y = yesterdayFromV3(v3, 'ttc', '504')!;
    expect([y.date, y.compareDate]).toEqual(['2026-10-15', '2026-10-08']);
    expect(y.weekly.thisWeek.late?.share).toBe(0.12);
    expect(y.weekly.lastWeek.late?.share).toBe(0.09);
    expect(y.weekly.comparable).toBe(true);
    expect(y.daily.late).toEqual([0.09, 0.05, 0.12]); // good days only
  });
  it('adds routes up by their own samples for the network', () => {
    const a = yesterdayFromV3(v3, 'ttc', '504')!;
    const net = agencyYesterday('ttc', [a, { ...a, route: '510', weekly: { ...a.weekly, thisWeek: { ...a.weekly.thisWeek, late: { share: 0.02, n: 300 } } } }])!;
    expect(net.weekly.thisWeek.late?.share).toBeCloseTo((0.12 * 100 + 0.02 * 300) / 400);
  });
});

describe('Yesterday wording', () => {
  it('names the day and the weekday it is compared with', () => {
    expect(dayText('2026-10-15')).toBe('Thursday, Oct 15');
    expect(againstLastWeekday('▲ from 9% last week', '2026-10-08')).toBe('▲ from 9% last Thursday');
    expect(dayComparedWith('2026-10-15', '2026-10-08')).toBe('Thursday, Oct 15, compared with Thursday, Oct 8');
  });
});
