import { describe, expect, it } from 'vitest';
import { diffSummaries, summarizeFeatures } from '../diff-period-figures';

// CIV-209: the dry-run summary carries each row's headline (all day and per period), so two cloud dry runs
// list every route whose route card headline moved, not only filter figures.
const row = (headway: number | null, midday: number | null) => ({
  properties: { routeId: 'r', routeShortName: '7', day: 'Weekday', directionId: 0, headsign: 'North', headway, headwayByPeriod: { midday } },
});

describe('diff-period-figures headlines (CIV-209)', () => {
  it('summarizes the headline and lists a moved headline as its own change', () => {
    const before = { agency: summarizeFeatures([row(30, 30)]) };
    const after = { agency: summarizeFeatures([row(43, 30)]) };
    expect(Object.values(before.agency)[0].headline).toEqual({ allDay: 30, midday: 30 });
    const { changes, report } = diffSummaries(before, after);
    expect(changes).toEqual([expect.objectContaining({ what: 'headline', period: 'allDay', before: 30, after: 43 })]);
    expect(report).toContain('Less frequent: 1 routes (1 cells)');
  });

  it('an older summary without headlines compares the figures only', () => {
    const old = summarizeFeatures([row(30, 30)]);
    for (const r of Object.values(old)) delete r.headline;
    const { changes } = diffSummaries({ agency: old }, { agency: summarizeFeatures([row(43, 30)]) });
    expect(changes).toEqual([]);
  });
});
