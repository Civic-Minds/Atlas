/**
 * #1769, #1770 (CIV-2227 option 1): a row's departure counts, which the route card's trip totals and the MCP's "no service"
 * check read, come from one list for the whole day. Fixture: Kingston routes 10 and 22 (fixtures/kingston-row-counts-gtfs/SOURCE.md).
 * Feed counts for weekday 2026-12-01: route 22 towards First Canada 33 trips (25 via MacCauley, 8 plain, among them
 * 23:02 and 23:38), route 10 33 each way.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { agencyProcessOptions } from '../agencyFeeds';

type Row = { routeShortName: string; day: string; directionId: number; headsign: string; stopId?: unknown; departuresByHour?: Record<string, number>; departureSpan?: { first: number; last: number }; headwayByPeriod?: Record<string, number | null> };

const total = (p: Row | undefined) => Object.values(p?.departuresByHour ?? {}).reduce((a, b) => a + b, 0);

describe('Kingston row departure counts (#1769, #1770)', () => {
  let rows: Row[] = [];
  beforeAll(async () => {
    const config = JSON.parse(readFileSync(resolve(__dirname, '../../config/agencies/kingston.json'), 'utf8'));
    const result = await processGtfsBuffer(readFileSync(resolve(__dirname, 'fixtures/kingston-row-counts-gtfs/feed.zip')), undefined, { ...agencyProcessOptions(config), serviceAnchor: '20261201' });
    rows = (JSON.parse(result.geojson).features as Array<{ properties: Row }>).map(f => f.properties).filter(p => p.stopId == null);
  }, 60_000);
  const weekday = (route: string) => rows.filter(p => p.routeShortName === route && p.day === 'Weekday');

  it('route 22 "First Canada" counts all 8 weekday trips, the 23:02 and 23:38 included, not only those inside the grading window', () => {
    const plain = weekday('22').find(p => p.headsign === 'First Canada');
    expect(total(plain)).toBe(8);
    expect(plain?.departuresByHour?.['23']).toBe(2);
    expect(plain?.departureSpan?.last).toBeGreaterThanOrEqual(23 * 60 + 38);
  });

  it('route 22 towards First Canada adds up to the feed\'s 33 weekday trips; the other direction keeps its 31', () => {
    const towards = weekday('22').filter(p => p.headsign?.startsWith('First Canada'));
    expect(towards.reduce((n, p) => n + total(p), 0)).toBe(33);
    expect(total(weekday('22').find(p => p.headsign === 'Innovation / Highway 15'))).toBe(31);
  });

  it('route 10 counts each weekday trip once: 33 each way, as the feed lists', () => {
    const dirs = weekday('10');
    expect(dirs).toHaveLength(2);
    for (const p of dirs) expect(total(p)).toBe(33);
  });

  it('the frequencies themselves do not move: route 10 weekday midday every 30', () => {
    for (const p of weekday('10')) expect(p.headwayByPeriod?.midday).toBe(30);
  });
});
