import { describe, expect, it } from 'vitest';
import { boardableDrawnStops, drawnStopsBeforeTerminal, stopReading } from '../drawnStops';
import { HEADLINE_WINDOWS, MIN_ALL_DAY_TERMINAL_DEPARTURES } from '../headway-utils';

// CIV-994: the drawn-stop rules process-core applies, in one place.
describe('drawn stops that count', () => {
  it('before the terminal: a terminal drawn twice, platform then parent (MBTA 71 to Harvard), leaves both out', () => {
    expect(drawnStopsBeforeTerminal(['2074', '76124', 'place-harsq'], new Set(['76124', 'place-harsq']))).toEqual(['2074']);
  });

  it('before the terminal: a drop-off-only stop next to a boardable terminal goes with the terminal group', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c', 'd'], new Set(['c']))).toEqual(['a', 'b']);
  });

  it('before the terminal: a drop-off-only stop with a boardable stop after it, before the terminal, stays', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c', 'd'], new Set(['b']))).toEqual(['a', 'b', 'c']);
  });

  it('before the terminal: no drop-off-only stops leaves out just the last stop; empty and one-stop lists give none', () => {
    expect(drawnStopsBeforeTerminal(['a', 'b', 'c'], new Set())).toEqual(['a', 'b']);
    expect(drawnStopsBeforeTerminal([], new Set())).toEqual([]);
    expect(drawnStopsBeforeTerminal(['a'], new Set())).toEqual([]);
  });

  it('boardable: every drop-off-only stop is left out (tier grading, #879)', () => {
    expect(boardableDrawnStops(['a', 'b', 'c'], new Set(['b', 'c']))).toEqual(['a']);
  });
});

// CIV-209 step 0: stopReading answers the three questions process-core used to answer inline, with the same rules.
describe('stopReading', () => {
  const { start, end } = HEADLINE_WINDOWS.allDay;
  const daytime = (n: number) => Array.from({ length: n }, (_, i) => start + 60 + i * 30);
  const none = new Set<string>();

  it('has a reading at MIN_ALL_DAY_TERMINAL_DEPARTURES unique daytime departures, not one fewer', () => {
    expect(stopReading('a', { times: daytime(MIN_ALL_DAY_TERMINAL_DEPARTURES), dropOffOnly: none })).toMatchObject({ boards: true, hasReading: true, gradeable: true });
    expect(stopReading('a', { times: daytime(MIN_ALL_DAY_TERMINAL_DEPARTURES - 1), dropOffOnly: none })).toMatchObject({ boards: true, hasReading: false, gradeable: false });
  });

  it('counts unique times only, and only inside the 6-22h window (edges included)', () => {
    const three = daytime(MIN_ALL_DAY_TERMINAL_DEPARTURES - 1);
    expect(stopReading('a', { times: [...three, three[0]], dropOffOnly: none }).hasReading).toBe(false);
    expect(stopReading('a', { times: [...three, start - 1, end + 1], dropOffOnly: none }).hasReading).toBe(false);
    expect(stopReading('a', { times: [...three, end], dropOffOnly: none }).hasReading).toBe(true);
    expect(stopReading('a', { times: [...three, start], dropOffOnly: none }).hasReading).toBe(true);
  });

  it('is a count only: four departures bunched in one hour still read (the floor and grade disagreement step 1 settles)', () => {
    expect(stopReading('a', { times: [start + 60, start + 75, start + 90, start + 105], dropOffOnly: none }).hasReading).toBe(true);
  });

  it('the floor counts a boarding stop with a reading unless its departures are bunched into one burst (CIV-209)', () => {
    const bunched = stopReading('a', { times: [start + 60, start + 75, start + 90, start + 105], dropOffOnly: none });
    expect(bunched).toMatchObject({ hasReading: true, bunched: true, countsInFloor: false });
    // A sparse stop with holes (ART 45's tail: a few trips spread over the day) still counts, so the headline never
    // reads better than the stops riders board at.
    const sparse = stopReading('a', { times: [start, start + 180, start + 360, start + 600], dropOffOnly: none });
    expect(sparse).toMatchObject({ hasReading: true, bunched: false, countsInFloor: true });
    expect(stopReading('a', { times: daytime(10), dropOffOnly: new Set(['a']) }).countsInFloor).toBe(false);
  });

  it('a drop-off-only stop does not board or grade, but keeps its reading for the floor (#879, CIV-1071 step A)', () => {
    expect(stopReading('a', { times: daytime(10), dropOffOnly: new Set(['a']) })).toMatchObject({ boards: false, hasReading: true, gradeable: false });
  });

  it('a stop with no list has no reading and still boards unless drop-off-only', () => {
    expect(stopReading('a', { times: undefined, dropOffOnly: none })).toMatchObject({ boards: true, hasReading: false, gradeable: false });
  });
});
