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
    const merged = longerTripDuration([t('20240101', 73, ['a', 'b']), t('20240101', 76, ['b', 'a'], '20240115')])!;
    expect(merged.durationMinutes).toBe(76);
    expect(merged.refDate).toBe('20240115');
    expect(merged.stopSequence).toEqual(['a', 'b', '|', 'b', 'a']);
  });

  it('keeps the other direction\'s date when the longer one has none', () => {
    expect(longerTripDuration([t('20240101', 76, ['a']), t('20240101', 73, ['b'], '20240115')])!.refDate).toBe('20240115');
  });

  it('equal minutes: the first direction listed, whichever order the stops are in', () => {
    const merged = longerTripDuration([t('20240101', 74, ['a', 'b'], '20240110'), t('20240101', 74, ['b', 'a'], '20240120')])!;
    expect(merged.durationMinutes).toBe(74);
    expect(merged.refDate).toBe('20240110');
  });

  it('no minutes in either direction means no trip time, never the other direction\'s', () => {
    expect(longerTripDuration([t('20240101', 0, ['a']), t('20240101', 73, ['b'])])).toBeNull();
    expect(longerTripDuration([t('20240101', 73, ['a']), t('20240101', 0, ['b'])])).toBeNull();
    expect(longerTripDuration([t('20240101', 73, ['a']), t('20240101', Number.NaN, ['b'])])).toBeNull();
    expect(longerTripDuration([t('20240101', 73, ['a']), t('20240101', -5, ['b'])])).toBeNull();
    expect(longerTripDuration([])).toBeNull();
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

  it('a period with a 0 in one direction is left out; the other periods stay', () => {
    const out = foldDirectionTripDurations({
      'Red-N': [t('20200101', 73, ['a', 'b']), t('20220101', 0, ['a', 'b']), t('20240101', 74, ['a', 'b'])],
      'Red-S': [t('20200101', 75, ['b', 'a']), t('20220101', 76, ['b', 'a']), t('20240101', 72, ['b', 'a'])],
    }, aliases);
    expect(out.Red.map(e => [e.periodKey, e.durationMinutes])).toEqual([['20200101', 75], ['20240101', 74]]);
  });

  it('a period with a file for one direction only is left out', () => {
    const out = foldDirectionTripDurations({
      'Red-N': [t('20200101', 73, ['a', 'b']), t('20240101', 74, ['a', 'b'])],
      'Red-S': [t('20240101', 72, ['b', 'a'])],
    }, aliases);
    expect(out.Red.map(e => [e.periodKey, e.durationMinutes])).toEqual([['20240101', 74]]);
    // One direction with no files at all: the line has no trip time.
    expect(foldDirectionTripDurations({ 'Red-N': [t('20200101', 73, ['a'])] }, aliases)).toEqual({ Red: [] });
  });

  it('a file under the merged key joins the halves for the same period and stands alone for its own', () => {
    const out = foldDirectionTripDurations({
      Red: [t('20240101', 77, ['a', 'b', 'a']), t('20260101', 78, ['a', 'b', 'a'])],
      'Red-N': [t('20200101', 73, ['a', 'b']), t('20240101', 74, ['a', 'b'])],
      'Red-S': [t('20200101', 75, ['b', 'a']), t('20240101', 72, ['b', 'a'])],
    }, aliases);
    expect(out.Red.map(e => [e.periodKey, e.durationMinutes]).sort()).toEqual([['20200101', 75], ['20240101', 77], ['20260101', 78]]);
    expect(out.Red.find(e => e.periodKey === '20240101')!.stopSequence).toEqual(['a', 'b', 'a', '|', 'a', 'b', '|', 'b', 'a']);
    expect(out.Red.find(e => e.periodKey === '20260101')!.stopSequence).toEqual(['a', 'b', 'a']);
    expect(Object.keys(out)).toEqual(['Red']);
  });

  it('three directions: the longest, and all three must be there', () => {
    const three = { Loop: ['Loop-A', 'Loop-B', 'Loop-C'].map(key => ({ key, direction: true as const })) };
    const out = foldDirectionTripDurations({
      'Loop-A': [t('20200101', 30, ['a']), t('20240101', 31, ['a'])],
      'Loop-B': [t('20200101', 34, ['b']), t('20240101', 33, ['b'])],
      'Loop-C': [t('20200101', 32, ['c'])],
    }, three);
    expect(out.Loop.map(e => [e.periodKey, e.durationMinutes])).toEqual([['20200101', 34]]);
    expect(out.Loop[0].stopSequence).toEqual(['a', '|', 'b', '|', 'c']);
  });

  it('leaves renames and agencies with no direction alias alone', () => {
    const routes = { '046': [t('20200101', 40, ['a'])], '46': [t('20240101', 41, ['a'])] };
    expect(foldDirectionTripDurations(routes, { '46': ['046'] })).toEqual(routes);
    expect(foldDirectionTripDurations(routes, undefined)).toEqual(routes);
  });
});
