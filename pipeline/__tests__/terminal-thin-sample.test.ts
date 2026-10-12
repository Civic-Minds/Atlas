import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { isThinAllDayTerminalSample } from '../headway-utils';

// #733: Step 4's terminal override took a two-gap mean from the all-day fallback window.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Step 4 terminal override on a thin all-day sample (#733)', () => {
  it('metrolink Riverside Line to L.A. Union Station keeps the hourly 60, not 210', async () => {
    // Hand count, GTFS service 1149 (Wed 2026-10-14): 03:54, 04:54, 05:54, 06:54, 12:54 from
    // Riverside, hourly plus one midday trip, median gap 60. The last on-shape stop sees 06:09,
    // 07:09 and 13:09 inside 06:00-22:00: gaps 60 and 360, a "median" of 210.
    const result = await processGtfsBuffer(await fixtureZip('metrolink-riverside'), undefined, { slug: 'metrolink' });
    const features = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Weekday');
    const toUnion = features.find((p: any) => p.headsign === 'L.A. Union Station');
    expect(toUnion).toMatchObject({ tier: 'infrequent', headway: 60 });
    for (const p of features) expect(p.worstDirectionHeadway).toBe(60);
  });

  it('flags only an all-day fallback sample with fewer than four departures', () => {
    expect(isThinAllDayTerminalSample([249, 309, 369, 429, 789])).toBe(true);   // Riverside: 3 in 06-22
    expect(isThinAllDayTerminalSample([369, 429, 489, 789])).toBe(false);       // 4 in 06-22: guard can test it
    expect(isThinAllDayTerminalSample([600, 660, 720])).toBe(false);            // midday headway exists
    expect(isThinAllDayTerminalSample([960, 1020, 1080])).toBe(false);          // PM-peak headway exists
    expect(isThinAllDayTerminalSample([249, 309, 369, 429, 789], 5)).toBe(true); // branch on 5 trips beats 3
    expect(isThinAllDayTerminalSample([373, 444, 854], 2)).toBe(false);          // mbta 439 Nahant: branch on 2 trips
  });
});
