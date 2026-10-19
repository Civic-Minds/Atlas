import { describe, expect, it } from 'vitest';
import { bunchPartsText, bunchTotalParts, builtText, coveredRoutesText, LATE_DEFINITION, LATE_SHORT, LATE_THRESHOLD, LATE_TILE_CAPTION, liveSubtitle } from '../liveWording';

describe('Live wording', () => {
  it('writes the build time in Toronto time, "Built Oct 16, 6:12 pm"', () => {
    expect(builtText('2026-10-16T22:12:03Z')).toBe('Built Oct 16, 6:12 pm');
    expect(builtText('2026-10-16T13:05:00Z')).toBe('Built Oct 16, 9:05 am');
  });

  it('names streetcar routes only when every covered route is one', () => {
    expect(coveredRoutesText('ttc', Array.from({ length: 9 }, () => ({ mode: 0 })))).toBe('9 TTC streetcar routes');
    expect(coveredRoutesText('ttc', [{ mode: 0 }, { mode: 3 }])).toBe('2 TTC routes');
  });

  it('builds the subtitle with the comparison week only when there is one', () => {
    const t = ['2026-10-08', '2026-10-14'], l = ['2026-10-01', '2026-10-07'];
    expect(liveSubtitle({ thisWeek: t, lastWeek: l, middle: '9 TTC streetcar routes', agency: 'ttc' })).toBe('Week of Oct 8–14, compared with Oct 1–7 · 9 TTC streetcar routes · estimated from vehicle positions, not reported by the TTC');
    expect(liveSubtitle({ thisWeek: t, lastWeek: null, middle: '2,553 trips', agency: 'ttc' })).toBe('Week of Oct 8–14 · 2,553 trips · estimated from vehicle positions, not reported by the TTC');
    expect(liveSubtitle({ thisWeek: t, lastWeek: l, middle: '3,454 trips', agency: 'ttc', upTo: '2026-10-14' })).toBe('Week of Oct 8–14, compared with Oct 1–7 · 3,454 trips · estimated from vehicle positions, not reported by the TTC · data up to Oct 14');
  });

  it('says 5½ min, never 5 min, wherever Late is named', () => {
    expect(LATE_THRESHOLD).toBe('more than 5½ min late');
    expect(LATE_SHORT).toBe("more than 5½ min late (TTC's 5-min standard + 30 s)");
    expect(LATE_TILE_CAPTION).toBe('of trips left the end of the line more than 5½ min late');
    expect(LATE_DEFINITION.startsWith('more than 5½ min behind the timetable')).toBe(true);
    for (const text of [LATE_THRESHOLD, LATE_SHORT, LATE_TILE_CAPTION]) expect(text).not.toMatch(/\b5 min late/);
  });
});

describe('bunching total and parts', () => {
  it('rounds the total first, then the too-close part; the too-far part is what remains, so they add up', () => {
    // 21.5% and 13.5% + 8.0% would read 22% beside 14% + 8%: the parts follow the total.
    expect(bunchTotalParts(0.215, 0.135, 0.08)).toEqual({ total: 22, bunched: 14, tooLong: 8 });
    expect(bunchPartsText(0.215, 0.135, 0.08)).toBe('14% · 8%');
    const p = bunchTotalParts(0.304, 0.204, 0.1);
    expect(p.bunched + p.tooLong).toBe(p.total);
  });
  it('keeps the part inside the total, and without parts the whole is the too-close part', () => {
    expect(bunchTotalParts(0.1, 0.3, 0)).toEqual({ total: 10, bunched: 10, tooLong: 0 });
    expect(bunchTotalParts(0.2, null, null)).toEqual({ total: 20, bunched: 20, tooLong: 0 });
  });
});
