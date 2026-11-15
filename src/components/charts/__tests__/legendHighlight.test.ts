import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * docs/style/VISUAL.md "Charts, graphs and graphics" (Ryan, 2026-11-15): a chart's legend picks its series. Hovering,
 * focusing or tapping an item highlights that series and fades the rest, the shared way (useActivePart). Every chart in
 * the chart collection that draws a legend must use it.
 */
const DIR = join(__dirname, '..');
// Legends that don't pick yet, each with its reason. Remove an entry once its chart uses useActivePart (a test below fails then).
const PENDING: Record<string, string> = {
  'GapsChart.tsx': "Live's bunching chart (Live is off everywhere); its three-colour key needs the shared highlight.",
};

const charts = readdirSync(DIR).filter(f => f.endsWith('.tsx')).map(f => [f, readFileSync(join(DIR, f), 'utf8')] as const);
const hasLegend = (src: string) => /LegendItem|legend/i.test(src);
const picks = (src: string) => /\buseActivePart\b/.test(src);

describe('chart legends pick their series (VISUAL.md)', () => {
  it('every chart with a legend uses useActivePart', () => {
    expect(charts.filter(([f, src]) => hasLegend(src) && !picks(src) && !(f in PENDING)).map(([f]) => f)).toEqual([]);
  });

  it('every pending chart still lacks it (remove the entry once fixed)', () => {
    for (const f of Object.keys(PENDING)) {
      const src = charts.find(([name]) => name === f)?.[1] ?? '';
      expect([f, hasLegend(src) && !picks(src)]).toEqual([f, true]);
    }
  });
});
