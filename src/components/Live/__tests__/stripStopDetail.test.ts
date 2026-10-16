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
