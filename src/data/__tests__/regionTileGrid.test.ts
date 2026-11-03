import { describe, expect, it } from 'vitest';
import { REGION_TILES } from '../regionTileGrid';

const byAbbr = new Map(Object.values(REGION_TILES).map(t => [t.abbr, t]));
const touch = (a: string, b: string) => {
  const p = byAbbr.get(a)!, q = byAbbr.get(b)!;
  return Math.abs(p.col - q.col) + Math.abs(p.row - q.row) === 1;
};

describe('the tile map layout (CIV-1282)', () => {
  it('gives each place its own square', () => {
    const cells = Object.values(REGION_TILES).map(t => `${t.col},${t.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it('keeps the main real neighbours side by side', () => {
    const pairs = 'WA-OR OR-CA UT-CO AZ-NM NE-KS OK-TX ND-MN MN-WI IL-IN IN-OH OH-PA PA-NY PA-NJ KY-TN AL-GA GA-SC GA-FL SC-NC VA-MD MD-DC MD-DE NH-ME CT-MA CT-RI WA-BC BC-AB AB-SK SK-MB QC-NB WA-ID ID-MT MT-ND NV-UT WY-CO SD-NE IA-MO MO-AR KS-OK LA-MS MS-AL TN-MS NY-VT VT-NH NJ-DE';
    expect(pairs.split(' ').filter(p => !touch(...(p.split('-') as [string, string])))).toEqual([]);
  });
});
