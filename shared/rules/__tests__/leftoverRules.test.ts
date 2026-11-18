import { describe, expect, it } from 'vitest';
import { NIGHT_SERVICE_CRITERIA } from '../../../pipeline/nightServiceIndex';
import { NIGHT_ONLY_DAY_START_MIN } from '../../../pipeline/tripSets';
import { PREVIOUS_NIGHT_TAIL_LAST_DEPARTURE_BEFORE_MIN } from '../../../pipeline/transit-phase2';
import { AIRPORTS } from '../../../src/data/airportHourly';
import { PERIOD_BANDS_ONLY } from '../../../src/components/Live/sections/figures';
import { LIVE_DAY_HOURS } from '../../../src/utils/sparklinePeriods';
import { TIME_LOSS_BANDS } from '../../../src/utils/timeLossReport';
import { onDemandRunningNote } from '../../onDemandAvailability';
import { DAYTIME_PERIOD_KEYS } from '../periods';

/**
 * CIV-1835: leftover hand-typed copies now read from shared/rules, each pinned to the literal it replaced so the swap is
 * proven to change nothing. scripts/live-segment-delay.ts builds its BANDS from the same ['all', ...DAYTIME_PERIOD_KEYS]
 * as TIME_LOSS_BANDS (the script runs on import, so it is pinned through the shared expression).
 */
describe('leftover copies read from shared/rules (CIV-1835)', () => {
  it('keeps the Live bands', () => {
    expect(TIME_LOSS_BANDS).toEqual(['all', 'amPeak', 'midday', 'pmPeak', 'evening']);
    expect(['all', ...DAYTIME_PERIOD_KEYS]).toEqual(['all', 'amPeak', 'midday', 'pmPeak', 'evening']);
    expect(PERIOD_BANDS_ONLY).toEqual([['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']]);
  });

  it('keeps the on-demand running note period words', () => {
    const availability = { Weekday: [{ startHour: 0, endHour: 30 }] };
    const words = (['amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight'] as const)
      .map(p => onDemandRunningNote(availability, 'Weekday', p).replace(/^Running during \S+ /, ''));
    expect(words).toEqual(['AM peak', 'midday', 'PM peak', 'evening', 'late', 'overnight']);
  });

  it('keeps the Live chart axis, 5 AM to 4 AM next day', () => {
    expect(LIVE_DAY_HOURS).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
  });

  it('keeps the pipeline minutes', () => {
    expect(PREVIOUS_NIGHT_TAIL_LAST_DEPARTURE_BEFORE_MIN).toBe(360);
    expect(NIGHT_ONLY_DAY_START_MIN).toBe(540);
  });

  it('keeps the night service criteria text', () => {
    expect(NIGHT_SERVICE_CRITERIA).toBe('At least one departure every 30, 60 or 90 minutes, 2am-5am local time, with no gap at the start or end of the core overnight window.');
  });

  it('keeps the airport story count at 157 (the text now reads AIRPORTS.length)', () => {
    expect(AIRPORTS.length).toBe(157);
  });
});
