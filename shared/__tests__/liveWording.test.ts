import { describe, expect, it } from 'vitest';
import { builtText, coveredRoutesText, liveSubtitle } from '../liveWording';

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
  });
});
