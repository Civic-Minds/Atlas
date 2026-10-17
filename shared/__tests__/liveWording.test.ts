import { describe, expect, it } from 'vitest';
import { builtText, coveredRoutesText, LATE_DEFINITION, LATE_SHORT, LATE_THRESHOLD, LATE_TILE_CAPTION, liveSubtitle } from '../liveWording';

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
