import { describe, expect, it } from 'vitest';
import { stopDetail, type RouteStripStop } from '../routeStripModel';

const base: RouteStripStop = { stopId: 's', name: 'King St West at Bathurst St', delayMin: 1, lateShare: 0.1, bunchingShare: 0.12, n: 900, bunchingN: 938 };

describe('stopDetail bunching line', () => {
  it('splits the share into bunched and too long when both are known', () => {
    const lines = stopDetail({ ...base, bunchedShare: 0.07, gappedShare: 0.05 }).lines;
    expect(lines).toContain('7% bunched · 5% too long');
    expect(lines).toContain('Usually 1 min late · 10% late');
    expect(lines.some(l => /departures measured|gaps\)/.test(l))).toBe(false);
    expect(stopDetail({ ...base, delayMin: -1.7 }).lines[0]).toBe('Usually 1.7 min early · 10% late');
    expect(stopDetail({ ...base, delayMin: 0 }).lines[0]).toBe('Usually on time · 10% late');
  });
  it('keeps the combined line when the parts are missing', () => {
    expect(stopDetail(base).lines).toContain('12% of gaps too short or too long');
  });
});

describe('early step (CIV-283)', () => {
  it('gives a stop 1+ min early its own step, and keeps up to 1 min either way as on time', async () => {
    const { stepFor } = await import('../routeStripModel');
    expect(stepFor('delay', -1.7)).toBe('early');
    expect(stepFor('delay', -1)).toBe('early');
    expect(stepFor('delay', -0.9)).toBe(0);
    expect(stepFor('delay', 0.8)).toBe(0);
    expect(stepFor('bunching', -0.5)).toBe(0);
  });
});

describe('early only at timed stops', () => {
  it('shows 1+ min early as early at a timepoint, and as on time where the timetable time is approximate', async () => {
    const { stopStep, stopDetail } = await import('../routeStripModel');
    const s = { stopId: 'x', name: 'X', delayMin: -1.8, lateShare: 0.05, bunchingShare: null, n: 500 };
    expect(stopStep({ ...s, timepoint: true }, 'delay')).toBe('early');
    expect(stopStep({ ...s, timepoint: false }, 'delay')).toBe(0);
    expect(stopStep({ ...s }, 'delay')).toBe('early'); // older files without the flag keep the early step
    expect(stopStep({ ...s, delayMin: 4, timepoint: false }, 'delay')).toBe(2);
    expect(stopDetail({ ...s, timepoint: false }).lines[0]).toBe('Usually on time · 5% late');
    expect(stopDetail({ ...s, timepoint: true }).lines[0]).toBe('Usually 1.8 min early · 5% late');
  });
});

describe('one rounding for colour and words', () => {
  it('colours a stop by the minutes as shown: 1 min late is not grey, 3 min late is not amber', async () => {
    const { stepFor, stopDetail } = await import('../routeStripModel');
    expect(stepFor('delay', 0.94)).toBe(0); // reads 0.9 min late
    expect(stepFor('delay', 0.96)).toBe(1); // reads 1 min late
    expect(stepFor('delay', 1)).toBe(1);
    expect(stepFor('delay', 2.94)).toBe(1);
    expect(stepFor('delay', 2.96)).toBe(2); // reads 3 min late
    expect(stepFor('bunching', 0.144)).toBe(0); // reads 14%
    expect(stepFor('bunching', 0.146)).toBe(1); // reads 15%
    expect(stepFor('bunching', 0.25)).toBe(2);
    const s = { stopId: 'x', name: 'X', delayMin: 0.96, lateShare: 0.1, bunchingShare: null, n: 500 };
    expect(stopDetail(s).lines[0]).toBe('Usually 1 min late · 10% late');
  });
  it('shows the same early reading in the hidden table as on the strip', async () => {
    const { shownDelayMin } = await import('../routeStripModel');
    const s = { stopId: 'x', name: 'X', delayMin: -5, lateShare: 0, bunchingShare: null, n: 500 };
    expect(shownDelayMin({ ...s, timepoint: false })).toBe(0);
    expect(shownDelayMin({ ...s, timepoint: true })).toBe(-5);
  });
  it('makes the gap parts add up to the total', async () => {
    const { bunchParts } = await import('../routeStripModel');
    const p = bunchParts({ stopId: 'x', name: 'X', delayMin: 0, lateShare: 0, bunchingShare: 0.204, bunchedShare: 0.124, gappedShare: 0.084, n: 100 })!;
    expect(p).toEqual({ total: 20, bunched: 12, tooLong: 8 });
    expect(p.bunched + p.tooLong).toBe(p.total);
  });
});
