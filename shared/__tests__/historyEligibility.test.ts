import { describe, expect, it } from 'vitest';
import {
  agencyHistoryTier,
  agencyQualifiesForHistory,
  agencyQualifiesForHistoryExplore,
  agencyQualifiesForHistoryRecent,
  distinctSnapshotYears,
  historyTierLabel,
  maxRouteSnapshotCount,
  MIN_HISTORY_DISTINCT_YEARS,
  MIN_HISTORY_RECENT_SNAPSHOTS,
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

  it('counts max snapshots across routes for short series', () => {
    const agency = {
      routes: [
        { snapshots: [{ year: 2025, label: 'Jan 2025' }] },
        {
          snapshots: [
            { year: 2025, label: 'Jan 2025' },
            { year: 2025, label: 'Jun 2025' },
            { year: 2026, label: 'Jan 2026' },
          ],
        },
      ],
    };
    expect(maxRouteSnapshotCount(agency)).toBe(3);
    expect(distinctSnapshotYears(agency)).toEqual([2025, 2026]);
  });

  it('qualifies short multi-snapshot series as Recent, not Explore', () => {
    const agency = {
      routes: [
        {
          snapshots: Array.from({ length: MIN_HISTORY_RECENT_SNAPSHOTS }, (_, i) => ({
            year: 2025,
            label: `Snap ${i}`,
          })),
        },
      ],
    };
    expect(agencyHistoryTier(agency)).toBe('recent');
    expect(agencyQualifiesForHistoryRecent(agency)).toBe(true);
    expect(agencyQualifiesForHistoryExplore(agency)).toBe(false);
    expect(agencyQualifiesForHistory(agency)).toBe(true);
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
    expect(agencyQualifiesForHistoryRecent(agency)).toBe(false);
  });

  it('labels tiers for UI', () => {
    expect(historyTierLabel('explore')).toBe('Explore');
    expect(historyTierLabel('recent')).toBe('Recent');
  });
});
