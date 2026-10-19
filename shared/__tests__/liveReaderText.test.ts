import { describe, expect, it } from 'vitest';
import { dashboardUnavailable, freshness, runningTimeSentence, type LiveV3 } from '../liveDashboard';
import { liveSubtitle } from '../liveWording';

/** Reader-facing text never carries a developer command; the commands live in the separate devHint fields. */
describe('reader-facing Live text', () => {
  const v3 = (dates: string[]) => ({ window: { dates } }) as unknown as LiveV3;
  const noon = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const texts: string[] = [
    dashboardUnavailable('burlington', '1')!.reason,
    dashboardUnavailable('ttc', '512')!.reason,
    freshness(v3(['2026-10-14']), '505', noon('2026-10-15')).text,
    freshness(v3(['2026-10-01']), '505', noon('2026-10-15')).text,
    freshness(v3([]), '505', noon('2026-10-15')).text,
    runningTimeSentence('Eastbound', null),
    runningTimeSentence('Eastbound', { n: 5, scheduledMin: 1, typicalMin: 1, p90Min: 1, overMin: 0 }),
    runningTimeSentence('Eastbound', { n: 120, scheduledMin: 22, typicalMin: 27, p90Min: 34, overMin: 5 }),
    liveSubtitle({ thisWeek: ['2026-10-08', '2026-10-14'], lastWeek: null, middle: '1 trip', agency: 'ttc', upTo: '2026-10-14' }),
  ];
  it('never mentions npm run or rebuilding', () => {
    for (const t of texts) {
      expect(t).not.toMatch(/npm run/);
      expect(t).not.toMatch(/Rebuild/i);
    }
  });
});
