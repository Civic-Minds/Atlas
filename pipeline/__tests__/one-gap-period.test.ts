import { describe, expect, it } from 'vitest';
import { isOneGapPeriod } from '../tripSets';

const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
const MIDDAY = [540, 900] as const, AM = [360, 540] as const, PM = [900, 1140] as const, EVENING = [1140, 1380] as const;

// #954 follow-up: an unsteady period's longest wait shown as "every N" when it is one gap between a
// few departures, not a cadence.
describe('isOneGapPeriod', () => {
  it('flags one gap between a few departures', () => {
    // TTC 10 weekday midday to Victoria Park (AM every 30 before, PM every 30 after): 315.
    expect(isOneGapPeriod(at('08:37', '09:07', '14:22', '14:52', '15:22'), ...MIDDAY, 315, false)).toBe(true);
    // TTC 166 to Milvan: 09:21, 14:23, 14:48 shows 302.
    expect(isOneGapPeriod(at('08:55', '09:21', '14:23', '14:48', '15:13'), ...MIDDAY, 302, false)).toBe(true);
    // OC 49 evening to Elmvale: two departures, 19:56 and 22:24, after 18:56 (148).
    expect(isOneGapPeriod(at('18:56', '19:56', '22:24'), ...EVENING, 148, undefined)).toBe(true);
  });

  it('keeps a slow cadence that repeats', () => {
    // MBTA 18 AM to Ashmont: 07:04, 08:28, then 09:52 (every 84).
    expect(isOneGapPeriod(at('07:04', '08:28', '09:52', '11:16'), ...AM, 84, undefined)).toBe(false);
    // Halifax 401 PM to Porters Lake: 10:00, then 16:14, 17:53, 19:32 (every 99).
    expect(isOneGapPeriod(at('10:00', '16:14', '17:53', '19:32'), ...PM, 99, undefined)).toBe(false);
  });

  it('keeps regular service with one gap inside it', () => {
    // TransLink 147 Saturday AM to Metrotown: 06:26, then 07:26 and every 30 (shows 60).
    expect(isOneGapPeriod(at('06:26', '07:26', '07:57', '08:27', '08:57', '09:28'), ...AM, 60, false)).toBe(false);
    // TransLink 310 evening to Scottsdale: every 28 to 21:12, then 22:12 and done.
    expect(isOneGapPeriod(at('18:53', '19:21', '19:49', '20:16', '20:44', '21:12', '22:12'), ...EVENING, 60, false)).toBe(false);
  });

  it('leaves steady periods and waits that match no gap alone', () => {
    // A steady period shows its cadence.
    expect(isOneGapPeriod(at('09:00', '10:10', '11:20', '12:30', '13:40', '14:50'), ...MIDDAY, 70, true)).toBe(false);
    // The first trip of the day at 13:00 then every 30: the 240 is a late start, not a gap between departures.
    expect(isOneGapPeriod(at('13:00', '13:30', '14:00', '14:30', '15:00'), ...MIDDAY, 240, false)).toBe(false);
    expect(isOneGapPeriod(at('13:00'), ...MIDDAY, null, false)).toBe(false);
  });
});
