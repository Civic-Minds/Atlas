import { describe, expect, it } from 'vitest';
import {
  agencyHistoryTier,
  agencyQualifiesForHistory,
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

  it('uses coverage metadata without requiring duplicate route snapshots', () => {
    expect(
      agencyQualifiesForHistoryExplore({
        coverageYears: Array.from({ length: MIN_HISTORY_DISTINCT_YEARS }, (_, i) => 2012 + i),
        routes: [{ snapshots: [{ year: 2012 }, { year: 2020 }] }],
      }),
    ).toBe(true);
  });

  it('does not qualify a short multi-snapshot series', () => {
    const agency = {
      routes: [
        {
          snapshots: [{ year: 2024 }, { year: 2025 }, { year: 2026 }],
        },
      ],
    };
    expect(agencyHistoryTier(agency)).toBeNull();
    expect(agencyQualifiesForHistoryExplore(agency)).toBe(false);
    expect(agencyQualifiesForHistory(agency)).toBe(false);
  });

  it('does not qualify a single-snapshot agency for either tier', () => {
    const agency = { routes: [{ snapshots: [{ year: 2024 }] }] };
    expect(agencyHistoryTier(agency)).toBeNull();
    expect(agencyQualifiesForHistory(agency)).toBe(false);
  });

  it('prefers Explore when year coverage hits the deep bar even with few route snaps', () => {
    const agency = {
      coverageYears: Array.from({ length: MIN_HISTORY_DISTINCT_YEARS }, (_, i) => 2010 + i),
      routes: [{ snapshots: [{ year: 2010 }, { year: 2019 }] }],
    };
    expect(agencyHistoryTier(agency)).toBe('explore');
  });
});
