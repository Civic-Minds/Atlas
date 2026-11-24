import { describe, expect, it } from 'vitest';
import {
  acceptRecordedSameSeason,
  acceptSameSeason,
  hasRedHeadwayShift,
  sameSeasonMatch,
  summarizeArtifact,
  type ArtifactSummary,
  type GateFlag,
} from '../releaseDiff.js';
import { archiveKeyEndDate, coversDate, sameDateLastYear, sameSeasonCandidates } from '../sameSeasonFeed.js';

const base = summarizeArtifact('{"features":[]}', null);
const summary = (filterHeadways: Record<string, number>): ArtifactSummary => ({ ...base, filterHeadways });

// RFTA's winter timetable (CIV-2297): BRT 30 -> 15 and the ski routes' AM peak in season.
const live = summary({ 'Weekday|all|BRT': 30, 'Weekday|amPeak|CM': 67, 'Weekday|amPeak|HC': 72, 'Weekday|all|LoVa': 30 });
const next = summary({ 'Weekday|all|BRT': 15, 'Weekday|amPeak|CM': 20, 'Weekday|amPeak|HC': 20, 'Weekday|all|LoVa': 30 });
const red: GateFlag = { slug: 'rfta', flag: 'headway-shift', level: 'red', message: '3 of 4 routes shift' };

describe('sameSeasonMatch (CIV-2335)', () => {
  it('matches when every shifted cell is back to last winter\'s figure', () => {
    const lastWinter = summary({ 'Weekday|all|BRT': 15, 'Weekday|amPeak|CM': 20, 'Weekday|amPeak|HC': 25, 'Weekday|all|LoVa': 60 });
    expect(sameSeasonMatch(live, lastWinter, next)).toEqual({ matched: true, checked: 3, unmatched: [] });
  });

  it('does not match when a shifted cell also halves or doubles against last year', () => {
    const lastWinter = summary({ 'Weekday|all|BRT': 30, 'Weekday|amPeak|CM': 20, 'Weekday|amPeak|HC': 20 });
    const result = sameSeasonMatch(live, lastWinter, next);
    expect(result.matched).toBe(false);
    expect(result.unmatched).toEqual(['Weekday all BRT 30->15 min against last year']);
  });

  it('does not match when last year has no figure for a shifted cell', () => {
    const lastWinter = summary({ 'Weekday|all|BRT': 15, 'Weekday|amPeak|CM': 20 });
    expect(sameSeasonMatch(live, lastWinter, next).unmatched).toEqual(['Weekday amPeak HC not in last year\'s feed']);
  });

  it('never matches with nothing shifted', () => {
    expect(sameSeasonMatch(live, live, live).matched).toBe(false);
  });
});

describe('acceptSameSeason', () => {
  const other: GateFlag = { slug: 'rfta', flag: 'drop', level: 'red', message: 'drop' };
  const source = { feed: 'gtfs/archive/rfta/20260412-abc.zip', readAt: '20251125' };

  it('turns only the agency\'s red headway-shift yellow and names the feed', () => {
    const [shift, drop, elsewhere] = acceptSameSeason([red, other, { ...red, slug: 'tarc' }], 'rfta', source);
    expect(shift.level).toBe('yellow');
    expect(shift.message).toContain('matches the same season last year (gtfs/archive/rfta/20260412-abc.zip, read at 20251125)');
    expect(drop.level).toBe('red');
    expect(elsewhere.level).toBe('red');
    expect(hasRedHeadwayShift([shift, drop], 'rfta')).toBe(false);
  });

  it('publish accepts a recorded match only while that refresh is the current one', () => {
    const recorded = { slug: 'rfta', lastRefreshedAt: '2026-11-24', sameSeasonMatch: { ...source, refreshedAt: '2026-11-24' } };
    expect(acceptRecordedSameSeason([red], [recorded])[0].level).toBe('yellow');
    expect(acceptRecordedSameSeason([red], [{ ...recorded, lastRefreshedAt: '2026-11-30' }])[0].level).toBe('red');
    expect(acceptRecordedSameSeason([red], [{ slug: 'rfta', lastRefreshedAt: '2026-11-24' }])[0].level).toBe('red');
  });
});

describe('sameSeasonFeed', () => {
  it('reads the same date a year earlier', () => {
    expect(sameDateLastYear('20261125')).toBe('20251125');
    expect(sameDateLastYear('20280229')).toBe('20270228');
  });

  it('reads the end date at the start of an archived zip name', () => {
    expect(archiveKeyEndDate('gtfs/archive/rfta/20260412-ab12cd.zip')).toBe('20260412');
    expect(archiveKeyEndDate('gtfs/archive/rfta/v2025.3-ab12cd.zip')).toBeNull();
    expect(archiveKeyEndDate('gtfs/archive/rfta/20261399-ab12cd.zip')).toBeNull();
  });

  it('tries dated zips that had not ended by the target, nearest end first, then undated ones newest first', () => {
    const at = (iso: string) => new Date(iso);
    const objects = [
      { key: 'gtfs/archive/rfta/20250901-a.zip', lastModified: at('2025-06-01'), size: 1 },
      { key: 'gtfs/archive/rfta/20270101-b.zip', lastModified: at('2026-11-01'), size: 1 },
      { key: 'gtfs/archive/rfta/20260412-c.zip', lastModified: at('2025-11-01'), size: 1 },
      { key: 'gtfs/archive/rfta/old-version.zip', lastModified: at('2024-01-01'), size: 1 },
      { key: 'gtfs/archive/rfta/new-version.zip', lastModified: at('2025-12-01'), size: 1 },
      { key: 'gtfs/archive/rfta--supplemental-1/20260412-d.zip', lastModified: at('2025-11-01'), size: 1 },
      { key: 'gtfs/archive/rfta/20260412-e.json', lastModified: at('2025-11-01'), size: 1 },
    ];
    expect(sameSeasonCandidates('rfta', objects, '20251125')).toEqual([
      'gtfs/archive/rfta/20260412-c.zip',
      'gtfs/archive/rfta/20270101-b.zip',
      'gtfs/archive/rfta/new-version.zip',
      'gtfs/archive/rfta/old-version.zip',
    ]);
  });

  it('covers a date only inside the advertised service', () => {
    expect(coversDate({ feedStart: '20251101', feedExpiry: '20260412' }, '20251125')).toBe(true);
    expect(coversDate({ feedStart: '20251201', feedExpiry: '20260412' }, '20251125')).toBe(false);
    expect(coversDate({ feedStart: null, feedExpiry: '20260412' }, '20251125')).toBe(false);
  });
});
