import { describe, expect, it } from 'vitest';
import { DEFAULT_LIVE_ARCHIVE_BUCKET, liveAgencyConfig, localDate, localHour, localServiceStart } from '../../shared/liveAgencyConfig';
import { loadLiveAgencyConfig } from '../live-agency-config';
import { serviceWindowFolders, torontoServiceStart } from '../live-fetch-archive';

describe('liveAgencyConfig', () => {
  it('gives the TTC its own places, labels and 4 a.m. day end, in the shared bucket', () => {
    const c = liveAgencyConfig('ttc', 'America/Toronto');
    expect(c.bucket).toBe('atlas-live');
    expect(c.positionsPrefix('2026-10-01')).toBe('positions/ttc/2026-10-01/');
    expect(c.serviceDayEndHour).toBe(4);
    expect(c.carhouses).toHaveLength(3);
    expect(c.notDiversions).toHaveLength(4); // the carhouses plus the Dufferin Gate loop
    expect(c.directionLabels).toBe('headsignFirstWordBound');
  });
  it('reads Kingston from its own bucket and gives it none of the TTC places', () => {
    const c = liveAgencyConfig('kingston', 'America/Toronto');
    expect(c.bucket).toBe('atlas-live-kingston');
    expect(c.positionsPrefix('2026-11-15')).toBe('positions/kingston/2026-11-15/');
    expect(c.carhouses).toEqual([]);
    expect(c.notDiversions).toEqual([]);
    expect(c.directionLabels).toBe('mostCommonHeadsign');
    expect(c.serviceDayEndHour).toBe(4);
  });
  it('uses the default bucket for an agency without its own', () => {
    expect(liveAgencyConfig('hamilton', 'America/Toronto').bucket).toBe(DEFAULT_LIVE_ARCHIVE_BUCKET);
  });
  it('refuses a missing or unknown timezone', () => {
    expect(() => liveAgencyConfig('x', undefined)).toThrow(/timezone/);
    expect(() => liveAgencyConfig('x', 'Mars/Olympus')).toThrow();
  });
  it('loads the timezone from config/agencies', () => {
    expect(loadLiveAgencyConfig('ttc').timeZone).toBe('America/Toronto');
    expect(loadLiveAgencyConfig('kingston').timeZone).toBe('America/Toronto');
    expect(() => loadLiveAgencyConfig('../ttc')).toThrow(/bad slug/);
  });
});

describe('local time in the agency zone', () => {
  it('finds the service-day end in summer and winter time', () => {
    expect(localServiceStart('2026-10-16', 'America/Toronto', 4)).toBe(Date.parse('2026-10-16T08:00:00Z') / 1000);
    expect(localServiceStart('2026-12-01', 'America/Toronto', 4)).toBe(Date.parse('2026-12-01T09:00:00Z') / 1000);
    expect(localServiceStart('2026-12-01', 'America/Vancouver', 3)).toBe(Date.parse('2026-12-01T11:00:00Z') / 1000);
    expect(localServiceStart('2026-12-01', 'America/St_Johns', 4)).toBe(Date.parse('2026-12-01T07:30:00Z') / 1000); // half-hour zone
  });
  it('matches the TTC helper it replaces', () => {
    for (const d of ['2026-03-08', '2026-07-01', '2026-11-01', '2026-11-02']) expect(localServiceStart(d, 'America/Toronto', 4)).toBe(torontoServiceStart(d));
  });
  it('gives the local date and hour', () => {
    expect(localDate(Date.parse('2026-10-16T02:00:00Z'), 'America/Toronto')).toBe('2026-10-15');
    expect(localHour(Date.parse('2026-10-16T02:00:00Z'), 'America/Toronto')).toBe(22);
  });
  it('cuts today\'s archive folder at the agency\'s own day end', () => {
    const now = Date.parse('2026-12-01T15:00:00Z');
    const f = serviceWindowFolders(1, now, { timeZone: 'America/Vancouver', serviceDayEndHour: 3 });
    expect(f.map(x => x.day)).toEqual(['2026-11-30', '2026-12-01']);
    expect(f[1].cutBefore).toBe(Date.parse('2026-12-01T11:00:00Z') / 1000);
  });
});
