import { describe, expect, it } from 'vitest';
import { decideDedupe, isSameLine, isThinNoDaytime, MIN_THIN_REPLACING_DEPARTURES, type DedupePattern } from '../featureDedupe';
import { MIN_ALL_DAY_TERMINAL_DEPARTURES } from '../headway-utils';

// The dedupe rules in order (#596, #716, #740, #772), each on the case that introduced it.

const pattern = (over: Partial<DedupePattern> = {}): DedupePattern => ({
  hasShape: true, dedupeHeadway: 20, headway: 20, departures: 40, hasDaytime: true, runsInDay: true, runsMidday: true, runsOnRepDay: true, carriesRepDay: true, ...over,
});

describe('decideDedupe', () => {
  it('an empty slot takes any candidate', () => {
    expect(decideDedupe(undefined, pattern({ dedupeHeadway: null }), undefined)).toBe('replace');
  });

  it('step 1: a drawn line always beats a mapless point, whichever is more frequent', () => {
    expect(decideDedupe(pattern(), pattern({ hasShape: false, dedupeHeadway: 5 }), undefined)).toBe('keep');
    expect(decideDedupe(pattern({ hasShape: false, dedupeHeadway: 5 }), pattern({ dedupeHeadway: 60 }), undefined)).toBe('replace');
  });

  it('step 2: the pattern carrying the representative weekday holds the drawn line (cata VE)', () => {
    const monThu = pattern({ dedupeHeadway: 24, runsOnRepDay: true, carriesRepDay: true });
    const fridayOnly = pattern({ dedupeHeadway: 21, runsOnRepDay: false, carriesRepDay: false });
    expect(decideDedupe(monThu, fridayOnly, 'Wednesday')).toBe('keep');
    expect(decideDedupe(fridayOnly, monThu, 'Wednesday')).toBe('replace');
    // Not a Weekday slot: the headway rule decides.
    expect(decideDedupe(monThu, fridayOnly, undefined)).toBe('replace');
    // A thin fragment running on that day is not preferred over a more frequent pattern.
    expect(decideDedupe(pattern({ dedupeHeadway: 20, runsOnRepDay: false }), pattern({ dedupeHeadway: 60, carriesRepDay: false }), 'Wednesday')).toBe('keep');
  });

  it('step 3: a thin pre-dawn result never holds the line against a daytime sample (TTC 100)', () => {
    const preDawn = pattern({ dedupeHeadway: 15, headway: 15, departures: 3, hasDaytime: false });
    const peak = pattern({ dedupeHeadway: 18, headway: 18, departures: 31 });
    expect(isThinNoDaytime(preDawn)).toBe(true);
    expect(decideDedupe(peak, preDawn, undefined)).toBe('keep');
    expect(decideDedupe(preDawn, peak, undefined)).toBe('replace');
    // A daytime block too small to be a sample (CapMetro per-trip shapes) keeps the headway rule.
    const smallBlock = pattern({ dedupeHeadway: 35, headway: 35, departures: MIN_THIN_REPLACING_DEPARTURES - 1 });
    expect(decideDedupe(preDawn, smallBlock, undefined)).toBe('keep');
    expect(decideDedupe(smallBlock, preDawn, undefined)).toBe('replace');
    expect(isThinNoDaytime({ hasDaytime: false, departures: MIN_ALL_DAY_TERMINAL_DEPARTURES })).toBe(false);
  });

  it('step 4: otherwise the better plain-median headway wins; span never beats a rated pattern', () => {
    expect(decideDedupe(pattern({ dedupeHeadway: 20 }), pattern({ dedupeHeadway: 15 }), undefined)).toBe('replace');
    expect(decideDedupe(pattern({ dedupeHeadway: 20 }), pattern({ dedupeHeadway: 20 }), undefined)).toBe('keep');
    expect(decideDedupe(pattern({ dedupeHeadway: 20 }), pattern({ dedupeHeadway: null }), undefined)).toBe('keep');
    expect(decideDedupe(pattern({ dedupeHeadway: null }), pattern({ dedupeHeadway: 60 }), undefined)).toBe('replace');
  });
});

describe('decideDedupe step 3b: the midday drawing of the same line (#844, #842)', () => {
  // A 10 km east-west line; about 0.0009 degrees of latitude is 100 m.
  const line = (endLatShift = 0, lonEnd = -79.876): number[][] => [[-80, 43.6], [-79.94, 43.6], [lonEnd, 43.6 + endLatShift]];
  const noMidday = (over: Partial<DedupePattern> = {}) => pattern({ dedupeHeadway: 33, headway: 33, departures: 15, runsMidday: false, line: line(), ...over });
  const midday = (over: Partial<DedupePattern> = {}) => pattern({ dedupeHeadway: 35, headway: 35, departures: 12, line: line(), ...over });

  it('the midday pattern takes and keeps the slot from a no-midday drawing of the same line (Lethbridge 4)', () => {
    expect(decideDedupe(noMidday(), midday(), undefined)).toBe('replace');
    expect(decideDedupe(midday(), noMidday(), undefined)).toBe('keep');
  });

  it('two platforms of one terminal are the same line; another terminal is not (REM A3, Brantford 3073)', () => {
    expect(isSameLine(line(), line(0.0001))).toBe(true);
    expect(isSameLine(line(), line(0.0018))).toBe(false);
    expect(decideDedupe(noMidday(), midday({ line: line(0.0018) }), undefined)).toBe('keep');
  });

  it('a longer peak-only line keeps its own geometry (#728)', () => {
    expect(decideDedupe(noMidday({ line: line(0, -79.7) }), midday(), undefined)).toBe('keep');
  });

  it('a midday block reading more than 20% off the other pattern is not the same service (CapMetro 337)', () => {
    expect(decideDedupe(noMidday({ dedupeHeadway: 30, headway: 30 }), midday({ dedupeHeadway: 38, headway: 38, departures: 9 }), undefined)).toBe('keep');
  });

  it('the midday side must be a real sample', () => {
    expect(decideDedupe(noMidday(), midday({ departures: MIN_THIN_REPLACING_DEPARTURES - 1 }), undefined)).toBe('keep');
  });
});

describe('a pattern with no departure 09:00-19:00 never holds the slot against a midday one (#877)', () => {
  const base = { hasShape: true, runsOnRepDay: true, carriesRepDay: true };
  // TTC 86 Saturday to Kennedy: 58 trips mornings and evenings (every 8, an AM-peak value, no
  // departure 9-19h) against 69 trips all day (every 10 at midday).
  const morningEvening = { ...base, dedupeHeadway: 8, headway: 8, departures: 25, hasDaytime: false, runsInDay: true, runsMidday: false };
  const allDay = { ...base, dedupeHeadway: 10, headway: 10, departures: 69, hasDaytime: true, runsInDay: true, runsMidday: true };
  it('replaces it and keeps the all-day pattern against it', () => {
    expect(decideDedupe(morningEvening, allDay, undefined)).toBe('replace');
    expect(decideDedupe(allDay, morningEvening, undefined)).toBe('keep');
  });
  it('still lets a midday pattern of a thin block lose on headway (CapMetro per-trip shapes)', () => {
    const thinMidday = { ...allDay, departures: 5 };
    expect(decideDedupe(morningEvening, thinMidday, undefined)).toBe('keep');
  });
});
