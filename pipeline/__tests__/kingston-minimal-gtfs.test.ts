/**
 * CIV-2039: Kingston's feed is the bare minimum GTFS (no calendar.txt, no direction_id, deadheads published as "Not In
 * Service" trips), so it runs the pipeline's fallback paths that few other agencies reach: calendar synthesis (#1538),
 * direction inference (#1542) and the not-in-service exclusion. This golden test processes a trimmed copy of the real feed
 * with Kingston's own config, so a change that breaks any of them fails here. Fixture source and licence: fixtures/kingston-minimal-gtfs/SOURCE.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { agencyProcessOptions } from '../agencyFeeds';

type Row = { routeShortName: string; day: string; directionId: number; headsign: string; stopId?: unknown; headwayByPeriod?: Record<string, number | null>; routeFilterHeadwayByPeriod?: Record<string, number | null> };

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir).filter(f => f.endsWith('.txt'))) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Kingston minimal GTFS, golden (CIV-2039)', () => {
  let rows: Row[] = [];
  beforeAll(async () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../../config/agencies/kingston.json'), 'utf8'));
    const result = await processGtfsBuffer(await fixtureZip('kingston-minimal-gtfs'), undefined, { ...agencyProcessOptions(config), serviceAnchor: '20261118' });
    rows = (JSON.parse(result.geojson).features as Array<{ properties: Row }>).map(f => f.properties).filter(p => p.stopId == null);
  }, 60_000);
  const row = (route: string, day: string, headsign: string) => rows.find(p => p.routeShortName === route && p.day === day && p.headsign === headsign);

  it('reads every day of the week from calendar_dates alone (#1538)', () => {
    for (const day of ['Weekday', 'Saturday', 'Sunday']) for (const route of ['2', '19']) expect(rows.some(p => p.routeShortName === route && p.day === day)).toBe(true);
  });

  it('leaves the "Not In Service" deadheads out, so no route card lists them as a direction', () => {
    expect(rows.filter(p => /not in service/i.test(p.headsign ?? ''))).toEqual([]);
  });

  it('route 2 runs every 30 to Division Street; its 4 trips back to the terminal have no regular frequency, so it has no filter figure', () => {
    for (const day of ['Weekday', 'Saturday', 'Sunday']) expect(row('2', day, 'Division Street')?.headwayByPeriod).toMatchObject({ amPeak: 30, midday: 30, pmPeak: 30 });
    for (const day of ['Weekday', 'Saturday', 'Sunday']) for (const p of rows.filter(x => x.routeShortName === '2' && x.day === day)) expect(p.routeFilterHeadwayByPeriod).toBeUndefined();
  });

  it('route 19, a one-way loop, keeps its figures: weekday every 30 with a 3-hour afternoon gap; weekends every 30 by midday (#1542)', () => {
    expect(row('19', 'Weekday', 'Cataraqui Centre')?.routeFilterHeadwayByPeriod).toEqual({ amPeak: null, midday: 30, pmPeak: 179, evening: 60, late: null, overnight: null });
    expect(row('19', 'Saturday', 'Cataraqui Centre')?.routeFilterHeadwayByPeriod).toEqual({ amPeak: 30, midday: 30, pmPeak: 30, evening: 60, late: null, overnight: null });
    expect(row('19', 'Sunday', 'Cataraqui Centre')?.routeFilterHeadwayByPeriod).toEqual({ amPeak: 72, midday: 30, pmPeak: 30, evening: 45, late: null, overnight: null });
  });
});
