import { describe, expect, it } from 'vitest';
import {
  agencyQualifiesForHistoryExplore,
  distinctSnapshotYears,
  MIN_HISTORY_DISTINCT_YEARS,
} from '../historyEligibility';

describe('historyEligibility', () => {
  it('counts distinct snapshot years across routes', () => {
    const agency = {
      routes: [
        { snapshots: [{ year: 2018 }, { year: 2020 }] },
        { snapshots: [{ year: 2020 }, { year: 2022 }] },
      ],
    };
    expect(distinctSnapshotYears(agency)).toEqual([2018, 2020, 2022]);
  });

  it('requires MIN_HISTORY_DISTINCT_YEARS for explore eligibility', () => {
    const years = Array.from({ length: MIN_HISTORY_DISTINCT_YEARS }, (_, i) => 2015 + i);
    expect(
      agencyQualifiesForHistoryExplore({
        routes: [{ snapshots: years.map(year => ({ year })) }],
      }),
    ).toBe(true);
    expect(
      agencyQualifiesForHistoryExplore({
        routes: [{ snapshots: years.slice(0, -1).map(year => ({ year })) }],
      }),
    ).toBe(false);
  });
});
