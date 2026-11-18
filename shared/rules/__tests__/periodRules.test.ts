import { describe, expect, it } from 'vitest';
import { DEFAULT_CRITERIA } from '../../../pipeline/defaults';
import {
  FREQUENT_SERVICE_WINDOW_END_MIN, FREQUENT_SERVICE_WINDOW_START_MIN, HEADLINE_WINDOWS, NIGHT_SERVICE_WINDOW_END_MIN,
  NIGHT_SERVICE_WINDOW_START_MIN, RESEARCH_FREQUENT_SERVICE_DAYTIME_END_MIN, RESEARCH_FREQUENT_SERVICE_EXTENDED_END_MIN,
  RESEARCH_FREQUENT_SERVICE_START_MIN,
} from '../../../pipeline/headway-utils';
import { STRETCH_NIGHT_END_MIN, STRETCH_NIGHT_START_MIN } from '../../../pipeline/tripSets';
import { MINUTES_PER_DAY, PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, SPARKLINE_HOURS, TIME_PERIODS, toGtfsHour } from '../../config';
import { DEFAULT_SERVICE_DAY_END_HOUR } from '../../liveAgencyConfig';

/**
 * Rules audit move 4: every period value, pinned as literals, so moving them into shared/rules/periods.ts is proven to
 * change nothing. A change here is a methodology change and needs Ryan's word-for-word OK (AGENTS.md).
 */
describe('period values (rules audit move 4)', () => {
  it('keeps the six map periods and their hours', () => {
    expect(TIME_PERIODS.map(p => [p.key, p.label, p.startHour, p.endHour])).toEqual([
      ['amPeak', 'AM peak', 6, 9], ['midday', 'Midday', 9, 15], ['pmPeak', 'PM peak', 15, 19],
      ['evening', 'Evening', 19, 23], ['late', 'Late', 23, 26], ['overnight', 'Overnight', 26, 30],
    ]);
    expect(PERIOD_KEYS).toEqual(['amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight']);
    expect(PERIOD_LABELS).toEqual({ amPeak: 'AM peak', midday: 'Midday', pmPeak: 'PM peak', evening: 'Evening', late: 'Late', overnight: 'Overnight' });
    expect(PERIOD_MINUTES).toEqual({
      amPeak: { start: 360, end: 540 }, midday: { start: 540, end: 900 }, pmPeak: { start: 900, end: 1140 },
      evening: { start: 1140, end: 1380 }, late: { start: 1380, end: 1560 }, overnight: { start: 1560, end: 1800 },
    });
    expect(MINUTES_PER_DAY).toBe(1440);
    expect([0, 5, 6, 23].map(toGtfsHour)).toEqual([24, 29, 6, 23]);
  });

  it('keeps the sparkline hours', () => {
    expect(SPARKLINE_HOURS).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 5]);
  });

  it('keeps the grading windows', () => {
    expect(DEFAULT_CRITERIA.dayTypes.Weekday?.timeWindow).toEqual({ start: 420, end: 1320 });
    expect(DEFAULT_CRITERIA.dayTypes.Saturday?.timeWindow).toEqual({ start: 420, end: 1320 });
    expect(DEFAULT_CRITERIA.dayTypes.Sunday?.timeWindow).toEqual({ start: 540, end: 1260 });
  });

  it('keeps the headline windows', () => {
    expect(HEADLINE_WINDOWS).toEqual({ midday: { start: 540, end: 900 }, pmPeak: { start: 900, end: 1140 }, allDay: { start: 360, end: 1320 } });
  });

  it('keeps both night windows as they are (2 to 6 AM for the night gap check, 2 to 5 AM for stretches; audit drift #1)', () => {
    expect([NIGHT_SERVICE_WINDOW_START_MIN, NIGHT_SERVICE_WINDOW_END_MIN]).toEqual([1560, 1800]);
    expect([STRETCH_NIGHT_START_MIN, STRETCH_NIGHT_END_MIN]).toEqual([1560, 1740]);
  });

  it('keeps the frequent-service windows', () => {
    expect([FREQUENT_SERVICE_WINDOW_START_MIN, FREQUENT_SERVICE_WINDOW_END_MIN]).toEqual([420, 1140]);
    expect([RESEARCH_FREQUENT_SERVICE_START_MIN, RESEARCH_FREQUENT_SERVICE_DAYTIME_END_MIN, RESEARCH_FREQUENT_SERVICE_EXTENDED_END_MIN]).toEqual([420, 1140, 1440]);
  });

  it('keeps the Live service day ending at 4 AM', () => {
    expect(DEFAULT_SERVICE_DAY_END_HOUR).toBe(4);
  });
});
