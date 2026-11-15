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
    // CIV-1605: each run of empty hours is a break between exact times.
    expect(computeDepartureSpan(times, SPARKLINE_HOURS)).toEqual({ first: 325, last: 1506, gaps: [[325, 436], [500, 1276], [1276, 1506]] });
  });

  it('claims no end where the list runs past the counted hours (CIV-1605: never a later start or earlier end)', () => {
    expect(computeDepartureSpan([600, 29 * 60 + 10], SPARKLINE_HOURS)).toEqual({ first: 600 });
    // TriMet 4: a 4:51 AM trip is before the counted hours, so 5:01 AM is not its first time.
    expect(computeDepartureSpan([291, 301, 600], SPARKLINE_HOURS)).toEqual({ last: 600, gaps: [[301, 600]] });
    expect(computeDepartureSpan([], SPARKLINE_HOURS)).toBeUndefined();
  });

  it('reads one hour\'s bounds', () => {
    expect(departureBoundsInHour([419, 425, 480], 7)).toEqual({ first: 425, last: 425 });
    expect(departureBoundsInHour([419], 7)).toBeNull();
  });

  it('takes each merged end from the list its hour came from, and never guesses', () => {
    const terminal = [430, 470, 1250, 1280];
    // First hour from the terminal list, last hour from the row's own list with its own span ending there.
    // The break's start is the terminal list's last departure in 7 AM; its end, from the row's own list, is bounded by the
    // one departure that list names in 9 PM (1270), so it's drawn no narrower than the real break.
    expect(mergedDepartureSpan({ 7: 2, 21: 1 }, { 7: true, 21: false }, terminal, { first: 440, last: 1270 })).toEqual({ first: 430, last: 1270, gaps: [[470, 1270]] });
    // The row's own span ends in another hour than the merged last hour: no last, and the break ends at that hour's end.
    expect(mergedDepartureSpan({ 7: 2, 20: 1 }, { 7: true, 20: false }, terminal, { first: 440, last: 1270 })).toEqual({ first: 430, gaps: [[470, 1260]] });
    // A terminal list with a trip before the counted hours gives no first.
    expect(mergedDepartureSpan({ 7: 1 }, { 7: true }, [250, 430], undefined)).toEqual({ last: 430 });
  });
});
