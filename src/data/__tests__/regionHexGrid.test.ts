import { describe, expect, it } from 'vitest';
import { REGION_HEXES } from '../regionHexGrid';

const byAbbr = new Map(Object.values(REGION_HEXES).map(h => [h.abbr, h]));
// Odd rows sit half a hex to the right: two hexes touch side by side, or one row apart and half a hex across.
const x = (h: { col: number; row: number }) => h.col + (h.row % 2 ? 0.5 : 0);
const touch = (a: string, b: string) => {
  const p = byAbbr.get(a)!, q = byAbbr.get(b)!;
  return (p.row === q.row && Math.abs(x(p) - x(q)) === 1) || (Math.abs(p.row - q.row) === 1 && Math.abs(x(p) - x(q)) === 0.5);
};

describe('the hex tile map layout (CIV-1282)', () => {
  it('gives each place its own hex', () => {
    const cells = Object.values(REGION_HEXES).map(h => `${h.col},${h.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('keeps the main real neighbours touching', () => {
    const pairs = 'WA-OR OR-CA CA-NV CA-AZ UT-CO AZ-NM CO-KS NE-KS OK-TX TX-LA ND-MN MN-WI IL-IN IN-OH OH-PA PA-NY PA-NJ KY-TN TN-AL AL-GA GA-FL GA-SC SC-NC NC-VA VA-MD MD-DC MD-DE NH-ME MA-NH CT-MA CT-RI AK-BC WA-BC BC-AB AB-SK SK-MB MB-ON ON-QC QC-NB NB-NS MN-ON MT-AB';
    expect(pairs.split(' ').filter(p => !touch(...(p.split('-') as [string, string])))).toEqual([]);
  });
});
