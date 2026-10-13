import { describe, expect, it } from 'vitest';
import { decideDedupe, isThinNoDaytime, MIN_THIN_REPLACING_DEPARTURES, type DedupePattern } from '../featureDedupe';
import { MIN_ALL_DAY_TERMINAL_DEPARTURES } from '../headway-utils';

// The dedupe rules in order (#596, #716, #740, #772), each on the case that introduced it.

const pattern = (over: Partial<DedupePattern> = {}): DedupePattern => ({
  hasShape: true, dedupeHeadway: 20, headway: 20, departures: 40, hasDaytime: true, runsOnRepDay: true, carriesRepDay: true, ...over,
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
