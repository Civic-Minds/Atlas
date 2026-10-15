import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('a rush-hour-only pattern never takes an all-day slot (#720, dedupe Step 3c)', () => {
  it('MBTA 7 to City Point keeps its all-day line, not the longer PM pattern every 6', async () => {
    // Real MBTA feed (fall 2026), route 7 outbound, weekday. Headsign "City Point" has an
    // all-day pattern from stop 16535 (26 trips, every 40-45 at midday) and a PM pattern from
    // 6535, one stop further out (22 trips 16:24-18:58, every 6). Once #720 rated steady peak
    // service, the PM pattern took the slot as the longer line: headline 6, part-time.
    const result = await processGtfsBuffer(await fixtureZip('mbta-7-weekday'), undefined, { slug: 'mbta' });
    const cityPoint = JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.directionId === 0 && p.headsign === 'City Point');
    expect(cityPoint).toMatchObject({ headway: 36, tier: 'infrequent', serviceClass: 'regular' });
    expect(cityPoint.headwayByPeriod).toMatchObject({ midday: 36, pmPeak: 6 });
  });

  const weekdayLine = async (fixture: string, slug: string, dir: number, headsign: string) => {
    const result = await processGtfsBuffer(await fixtureZip(fixture), undefined, { slug });
    return JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.directionId === dir && p.headsign === headsign);
  };

  it("a rush-hour sibling's trips never lift a thin line's pooled headline (LA Metro 105, CDTA 233)", async () => {
    // LA Metro 105 to Marlton / King: a thin line read 27 (worst pooled reading on its stops).
    // Once the PM pattern to Washington Fairfax Hub was rated, its trips pooled at the shared
    // stops and the line read 10, the trunk's peak.
    expect(await weekdayLine('lacmta-105', 'lacmta', 0, 'Marlton / King Layover')).toMatchObject({ headway: 27 });
    // CDTA 233 to Pearl & Hudson: three trips a day (04:13, 05:27, 17:02) read 34 once the
    // rush-hour pattern to ESP/Downtown Albany pooled with it, against 385 before.
    expect(await weekdayLine('cdta-233', 'cdta', 1, 'Pearl & Hudson')).toMatchObject({ headway: 385 });
  });
});
