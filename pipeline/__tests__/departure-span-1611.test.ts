import { describe, expect, it } from 'vitest';
import { computeDepartureSpan, computeHourDepartureCounts, departureBoundsInHour } from '../headway-utils';
import { mergedDepartureSpan } from '../process-core';
import { SPARKLINE_HOURS } from '../../shared/config';

describe('departure span (CIV-1611)', () => {
  it('ends on the first and last departures the hour counts read', () => {
    const times = [325.4, 436, 500, 1276, 1505.6];
    const counts = computeHourDepartureCounts(times, SPARKLINE_HOURS);
    expect(Object.keys(counts).map(Number).sort((a, b) => a - b)).toEqual([5, 7, 8, 21, 25]);
    // 5 AM is last in SPARKLINE_HOURS (the sparkline's overnight tail) but first in the day.
    expect(computeDepartureSpan(times, SPARKLINE_HOURS)).toEqual({ first: 325, last: 1506 });
  });

  it('leaves out times the counts leave out (after the last counted hour)', () => {
    expect(computeDepartureSpan([600, 29 * 60 + 10], SPARKLINE_HOURS)).toEqual({ first: 600, last: 600 });
    expect(computeDepartureSpan([], SPARKLINE_HOURS)).toBeUndefined();
  });

  it('reads one hour\'s bounds', () => {
    expect(departureBoundsInHour([419, 425, 480], 7)).toEqual({ first: 425, last: 425 });
    expect(departureBoundsInHour([419], 7)).toBeNull();
  });

  it('takes each merged end from the list its hour came from, and never guesses', () => {
    const terminal = [430, 470, 1250, 1280];
    // First hour from the terminal list, last hour from the row's own list with its own span ending there.
    expect(mergedDepartureSpan({ 7: 2, 21: 1 }, { 7: true, 21: false }, terminal, { first: 440, last: 1270 })).toEqual({ first: 430, last: 1270 });
    // The row's own span ends in another hour than the merged last hour: no span.
    expect(mergedDepartureSpan({ 7: 2, 20: 1 }, { 7: true, 20: false }, terminal, { first: 440, last: 1270 })).toBeUndefined();
  });
});
