import { describe, expect, it } from 'vitest';
import { bunchingLinks, bunchingProfile, MIN_GAPS, stopBunching, type GapWindow, type StopBunching } from '../bunching';

const win = (actual: number[], scheduled = 300): GapWindow => ({ actualGaps: actual, scheduledGaps: Array(actual.length).fill(scheduled) });

describe('stopBunching', () => {
  it('counts gaps under 2 min as bunched and gaps over 2x the scheduled gap as gapped', () => {
    // scheduled 300 s: 100 and 60 are bunched, 700 is gapped, 300 and 350 are fine.
    const s = stopBunching('S', [win([100, 60, 700, 300, 350])]);
    expect(s).toMatchObject({ n: 5, bunchedShare: 0.4, gappedShare: 0.2 });
    expect(s.badShare).toBeCloseTo(0.6);
    expect(s.medianGapSec).toBe(300);
  });

  it('grades each window against its own schedule', () => {
    const peak = win([700], 300);       // gapped: over 600
    const evening = win([700], 600);    // fine: under 1200
    expect(stopBunching('S', [peak, evening]).gappedShare).toBe(0.5);
  });
});

describe('bunchingProfile', () => {
  const stop = (id: string, bad: number): StopBunching => ({ stopId: id, n: MIN_GAPS, bunchedShare: bad, gappedShare: 0, badShare: bad, medianGapSec: 300, spread: 2 });

  it('names the largest step in the bad share that stays up to the end, e.g. 5-minute departures turning into trains of three', () => {
    const stops = [stop('T', 0.05), stop('A', 0.06), stop('B', 0.05), stop('C', 0.07), stop('D', 0.2), stop('E', 0.3), stop('F', 0.35), stop('G', 0.4)];
    const p = bunchingProfile(stops);
    expect(p.baselineBadShare).toBeCloseTo(0.0533, 3);
    expect(p.forms).toMatchObject({ fromStopId: 'C', toStopId: 'D' });
    expect(p.forms!.rise).toBeCloseTo(0.13);
    expect(p.kind).toBe('forms');
    expect(p.biggestRise).toMatchObject({ fromStopId: 'C', toStopId: 'D' });
  });

  it('ignores a blip that does not stay up for the next few stops, and says nothing when the route stays even', () => {
    const blip = [stop('T', 0.05), stop('A', 0.05), stop('B', 0.05), stop('C', 0.05), stop('D', 0.2), stop('E', 0.05), stop('F', 0.05)];
    expect(bunchingProfile(blip).forms).toBeNull();
    const even = [stop('T', 0.05), stop('A', 0.06), stop('B', 0.05), stop('C', 0.06), stop('D', 0.07)];
    expect(bunchingProfile(even).forms).toBeNull();
  });

  it('never names a stretch touching a terminal (the run out of a loop), the same rule as delay build-up', () => {
    const stops = [stop('T', 0.05), stop('A', 0.05), stop('B', 0.05), stop('L', 0.05), stop('M', 0.3), stop('N', 0.3), stop('O', 0.3), stop('P', 0.3)];
    expect(bunchingProfile(stops).forms).toMatchObject({ fromStopId: 'L', toStopId: 'M' });
    const p = bunchingProfile(stops, id => id === 'L');
    expect(p.forms).toBeNull();
    expect(p.biggestRise?.fromStopId).not.toBe('L');
  });

  it('still names a step that later recovers, if it stays up for the next 3 stops', () => {
    const rec = [stop('T', 0.05), stop('A', 0.05), stop('B', 0.05), stop('C', 0.05), stop('D', 0.25), stop('E', 0.25), stop('F', 0.24), stop('G', 0.05), stop('H', 0.05)];
    expect(bunchingProfile(rec).forms).toMatchObject({ fromStopId: 'C', toStopId: 'D' });
  });

  it('looks 1 km ahead when stops are close together', () => {
    const near = (id: string, bad: number, m: number) => ({ ...stop(id, bad), alongM: m });
    const close = [near('T', 0.05, 0), near('A', 0.05, 100), near('B', 0.05, 200), near('C', 0.05, 300), near('D', 0.25, 400), near('E', 0.25, 500), near('F', 0.25, 600), near('G', 0.05, 800)];
    expect(bunchingProfile(close).forms).toBeNull();
  });

  it('calls a slow climb with no single step gradual, and keeps the biggest rise', () => {
    const climb = [stop('T', 0.05), stop('A', 0.05), stop('B', 0.05), stop('C', 0.09), stop('D', 0.14), stop('E', 0.19), stop('F', 0.24)];
    const p = bunchingProfile(climb);
    expect(p.kind).toBe('gradual');
    expect(p.forms).toBeNull();
    expect(p.climb).toBeCloseTo(0.19);
    expect(p.biggestRise!.rise).toBeCloseTo(0.05);
  });

  it('skips stops with too few gaps and needs enough stops to judge', () => {
    const thin = { ...stop('X', 0.9), n: 3 };
    expect(bunchingProfile([stop('T', 0.05), thin, stop('A', 0.05)]).forms).toBeNull();
    expect(bunchingProfile([stop('T', 0.05), stop('A', 0.05)]).baselineBadShare).toBeNull();
  });
});

describe('bunchingLinks ("linked to", with the number)', () => {
  it('links only what passes its threshold and always carries the number', () => {
    const links = bunchingLinks({ terminalBadShare: 0.05, standStill: { eventsPerDay: 2, minutesPerDay: 9 }, slowestSegment: { fromStopId: 'a', toStopId: 'b', gainedSec: 75 }, shortTurnsPerDay: 0.1 });
    expect(links.map(l => [l.kind, l.linked, l.value])).toEqual([
      ['terminal_departures', false, 0.05], ['stood_still', true, 2], ['slow_stretch', true, 75], ['short_turns', false, 0.1],
    ]);
  });

  it('marks a missing measurement as not linked with no number', () => {
    const links = bunchingLinks({ terminalBadShare: null, standStill: null, slowestSegment: null, shortTurnsPerDay: null });
    expect(links.every(l => !l.linked && l.value === null)).toBe(true);
  });
});
