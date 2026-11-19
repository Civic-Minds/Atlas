import { describe, expect, it } from 'vitest';
import { stretchColorHeadway } from '../frequencySegments';

/**
 * #1093 lone-stop exception (docs/product/DECISIONS.md, 2026-11-18): one stop one tier worse than the rest of a drawn
 * stretch doesn't set its colour, unless a slower section starts past the stretch end or the stop's longest gap is a
 * real hole. Shapes from the hand-checks on release-mwl8qwjk.
 */
type Stop = { value: number | null; own?: number; gap?: number };
function stretch(stops: Stop[]) {
  const stopOrder = stops.map((_, i) => `s${i}`);
  const stopPeriodHeadways = Object.fromEntries(stops.map((s, i) => [`s${i}`, { midday: s.own ?? s.value ?? undefined }]));
  const stopPeriodCoverageHeadways = Object.fromEntries(stops.map((s, i) => [`s${i}`, { midday: s.gap ?? undefined }]));
  return { p: { stopOrder, stopPeriodHeadways, stopPeriodCoverageHeadways } as any, valueAt: (i: number) => stops[i].value };
}
const color = (stops: Stop[], from: number, to: number, period: any = 'midday') => {
  const { p, valueAt } = stretch(stops);
  return stretchColorHeadway(p, period, from, to, valueAt);
};
const run = (vals: number[]): Stop[] => vals.map(value => ({ value, gap: value + 3 }));

describe('the lone-stop exception (#1093)', () => {
  it('a lone stop one tier worse in the middle leaves the stretch its colour (TTC 96: 16 among 15s)', () => {
    expect(color(run([15, 15, 15, 16, 15, 15]), 0, 5)).toBe(15);
  });

  it('a lone end stop one tier worse leaves the stretch its colour when the stop past it is better (DRT 901 Simcoe)', () => {
    const stops = [{ value: 12 }, ...run([16, 15, 15, 15, 15, 15, 15])];
    expect(color(stops, 1, 7)).toBe(15);
  });

  it('not when a slower section starts past the stretch end (Hamilton 35 evening: 40, then 45 past the stretch)', () => {
    const stops = [...run([30, 30, 30, 30, 40]), { value: 45 }];
    expect(color(stops, 0, 4)).toBe(40);
  });

  it('not when the lone stop has a real hole in service (LA Metro 33 Sunday: last stop 25, longest gap 54)', () => {
    const stops: Stop[] = [...[11, 14, 16, 18, 15].map(value => ({ value, gap: 20 })), { value: 25, gap: 54 }];
    expect(color(stops, 0, 5)).toBe(25);
  });

  it('not for two worse stops, side by side or apart', () => {
    expect(color(run([15, 16, 16, 15, 15]), 0, 4)).toBe(16);
    expect(color(run([15, 16, 15, 15, 16, 15]), 0, 5)).toBe(16);
  });

  it('not for a stop two tiers worse', () => {
    expect(color(run([15, 15, 25, 15, 15]), 0, 4)).toBe(25);
  });

  it('not on a stretch under 3 stops, nor for the all-day value', () => {
    expect(color(run([15, 16]), 0, 1)).toBe(16);
    expect(color(run([15, 15, 16, 15]), 0, 3, 'all')).toBe(16);
  });

  it('never shows a stretch better than its other stops (the colour is their worst)', () => {
    expect(color(run([12, 14, 16, 13, 15]), 0, 4)).toBe(15);
  });
});
