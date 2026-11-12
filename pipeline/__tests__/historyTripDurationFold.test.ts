/**
 * #1431: trip time files recorded under a merged line's per-direction keys fold into the merged key,
 * one entry per period, the longer direction's minutes.
 */
import { describe, expect, it } from 'vitest';
import { foldDirectionTripDurations, longerTripDuration, type TripDurationPeriod } from '../historyIdentity.js';

const t = (periodKey: string, durationMinutes: number, stopSequence: string[], refDate?: string): TripDurationPeriod =>
  ({ periodKey, durationMinutes, stopSequence, ...(refDate ? { refDate } : {}) });
const aliases = { Red: [{ key: 'Red-N', direction: true as const }, { key: 'Red-S', direction: true as const }] };

describe('trip time of a merged line (#1431)', () => {
  it('takes the longer direction and keeps both directions\' stops', () => {
    const merged = longerTripDuration(t('20240101', 73, ['a', 'b']), t('20240101', 76, ['b', 'a'], '20240115'));
    expect(merged.durationMinutes).toBe(76);
    expect(merged.refDate).toBe('20240115');
    expect(merged.stopSequence).toEqual(['a', 'b', '|', 'b', 'a']);
  });

  it('keeps the other direction\'s date when the longer one has none', () => {
    expect(longerTripDuration(t('20240101', 76, ['a']), t('20240101', 73, ['b'], '20240115')).refDate).toBe('20240115');
  });

  it('folds the halves into the merged key, one entry per period', () => {
    const out = foldDirectionTripDurations({
      'Red-N': [t('20200101', 73, ['a', 'b']), t('20240101', 74, ['a', 'b'])],
      'Red-S': [t('20200101', 75, ['b', 'a']), t('20240101', 72, ['b', 'a'])],
      Blue: [t('20200101', 60, ['x'])],
    }, aliases);
    expect(Object.keys(out).sort()).toEqual(['Blue', 'Red']);
    expect(out.Red.map(e => [e.periodKey, e.durationMinutes])).toEqual([['20200101', 75], ['20240101', 74]]);
    // The same stops in both periods, whichever direction was longer: the line did not change.
    expect(out.Red[0].stopSequence).toEqual(out.Red[1].stopSequence);
    expect(out.Blue).toEqual([t('20200101', 60, ['x'])]);
  });

  it('a period with one direction only has different stops, so it reads as a changed line', () => {
    const out = foldDirectionTripDurations({
      'Red-N': [t('20200101', 73, ['a', 'b']), t('20240101', 74, ['a', 'b'])],
      'Red-S': [t('20240101', 72, ['b', 'a'])],
    }, aliases);
    expect(out.Red[0].stopSequence).not.toEqual(out.Red[1].stopSequence);
  });

  it('leaves renames and agencies with no direction alias alone', () => {
    const routes = { '046': [t('20200101', 40, ['a'])], '46': [t('20240101', 41, ['a'])] };
    expect(foldDirectionTripDurations(routes, { '46': ['046'] })).toEqual(routes);
    expect(foldDirectionTripDurations(routes, undefined)).toEqual(routes);
  });
});
