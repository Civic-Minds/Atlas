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

  describe('realYearsOnly (History v2, opt-in)', () => {
    const real = { realYearsOnly: true };

    it('ignores coverage metadata: only real snapshot years count', () => {
      const agency = {
        coverageYears: Array.from({ length: MIN_HISTORY_DISTINCT_YEARS }, (_, i) => 2012 + i),
        routes: [{ snapshots: [{ year: 2012 }, { year: 2020 }] }],
      };
      expect(agencyQualifiesForHistoryExplore(agency, real)).toBe(false);
      expect(agencyHistoryTier(agency, real)).toBeNull();
      // Default rule is unchanged: the same agency still qualifies.
      expect(agencyQualifiesForHistoryExplore(agency)).toBe(true);
      expect(distinctSnapshotYears({ coverageYears: [2010, 2011], routes: [{ snapshots: [{ year: 2020 }] }] }, real)).toEqual([2020]);
    });

    it('does not count years after the build year', () => {
      const agency = { routes: [{ snapshots: [{ year: 2024 }, { year: 2026 }, { year: 2027 }, { year: 2099 }] }] };
      expect(distinctSnapshotYears(agency, { realYearsOnly: true, buildYear: 2026 })).toEqual([2024, 2026]);
      // The default rule also drops future years (it still counts coverage years, unlike v2).
      expect(distinctSnapshotYears(agency, { buildYear: 2026 })).toEqual([2024, 2026]);
    });

    it('still qualifies an agency with enough real snapshot years', () => {
      const years = Array.from({ length: MIN_HISTORY_DISTINCT_YEARS }, (_, i) => 2010 + i);
      expect(agencyQualifiesForHistory({ routes: [{ snapshots: years.map(year => ({ year })) }] }, { realYearsOnly: true, buildYear: 2026 })).toBe(true);
    });
  });

  describe('future-dated years never count', () => {
    const real = Array.from({ length: 9 }, (_, i) => 2017 + i); // 2017-2025
    const opts = { buildYear: 2026 };
    it('ignores snapshot and coverage years after the build year under both rules', () => {
      const agency = { coverageYears: [2016, 2027], routes: [{ snapshots: [...real, 2026, 2027].map(year => ({ year })) }] };
      expect(distinctSnapshotYears(agency, opts)).toEqual([2016, ...real, 2026]);
      expect(distinctSnapshotYears(agency, { ...opts, realYearsOnly: true })).toEqual([...real, 2026]);
    });
    it('does not let a future year make up the tenth year', () => {
      const nine = { routes: [{ snapshots: [...real, 2027].map(year => ({ year })) }] };
      expect(agencyQualifiesForHistory(nine, opts)).toBe(false);
      expect(agencyQualifiesForHistory({ routes: [{ snapshots: [...real, 2026].map(year => ({ year })) }] }, opts)).toBe(true);
    });
  });
});
