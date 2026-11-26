import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_PERIODS_SHOWN_NOTE, SCHEDULE_OVERVIEW_TITLE } from '../content/noticeCopy';
import { fleetPeriodCountText } from '../../shared/studioWording';

// CIV-2973 step 3: the sparklines' three hand-typed strings moved to the shared wording files, unchanged.
describe('sparkline wording lives in the shared wording files, unchanged (CIV-2973)', () => {
  it('reads exactly as before', () => {
    expect(SCHEDULE_OVERVIEW_TITLE).toBe('Schedule overview');
    expect(ALL_PERIODS_SHOWN_NOTE).toBe('All time periods are shown together.');
    expect(fleetPeriodCountText('Midday', 1790, 'buses')).toBe('Midday: 1,790 buses');
  });

  it('is never typed again in the chart files', () => {
    const chart = readFileSync('src/components/Interval/HeadwaySparkline.tsx', 'utf8');
    const fleet = readFileSync('src/apps/studio/Fleet.tsx', 'utf8');
    expect(chart).not.toContain("'Schedule overview'");
    expect(chart).not.toContain('All time periods are shown together.');
    expect(fleet).not.toMatch(/\$\{PERIOD_LABELS\[p\]\}: /);
  });
});
