import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staleFeedReport, staleFeedRows, type StaleFeedAgency } from './report-stale-feeds';

const agency = (slug: string, lastFeedExpiry: string | null, extra: Partial<StaleFeedAgency> = {}): StaleFeedAgency =>
  ({ slug, name: slug.toUpperCase(), region: 'Somewhere', lastFeedExpiry, lastRefreshedAt: '2026-08-07', ...extra });

// #612 follow-up: expired timetables kept on purpose must still be reported, never silently kept.
describe('weekly stale-feed report', () => {
  it('lists public agencies past their timetable end, longest expired first', () => {
    const rows = staleFeedRows([
      agency('sfmta', '20260828', { feedRefreshError: 'all available feeds expired (latest 20260828)' }),
      agency('ttc', '20261231'),
      agency('taft', '20220101'),
    ], '20261013');
    expect(rows.map(r => [r.slug, r.expiredOn, r.daysExpired])).toEqual([
      ['taft', '2022-01-01', 1746],
      ['sfmta', '2026-08-28', 46],
    ]);
  });

  it('leaves out hidden and staged agencies, and ones never published', () => {
    const rows = staleFeedRows([
      agency('ecat', '20221101', { hiddenInProduction: true }),
      agency('new', '20250101', { staged: true }),
      agency('never', '20250101', { lastRefreshedAt: null }),
    ], '20261013');
    expect(rows).toEqual([]);
  });

  it('writes one table row per agency, and says so when there are none', () => {
    const rows = staleFeedRows([agency('path', '20260601', { feedUrl: 'https://example.com/a|b.zip' })], '20261013');
    const body = staleFeedReport(rows, '20261013');
    expect(body).toContain('1 public agency is still showing a timetable that has expired (checked 2026-10-13)');
    expect(body).toContain('| PATH (Somewhere) | `path` | 2026-06-01 | 134 | https://example.com/a\\|b.zip |');
    expect(staleFeedReport([], '20261013')).toBe('No public agency is on an expired timetable (checked 2026-10-13).\n');
  });

  it('runs on the real catalog', () => {
    const index = JSON.parse(readFileSync('public/data/index.json', 'utf8')) as { agencies: StaleFeedAgency[] };
    const rows = staleFeedRows(index.agencies, '20261013');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.daysExpired > 0)).toBe(true);
  });
});
