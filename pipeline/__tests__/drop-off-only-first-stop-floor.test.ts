import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-234: the #771 floor leaves out a drop-off-only stop (#879) further along the line, but a
// drop-off-only FIRST stop is a layover whose times are the trips' starts. There the first stop
// riders can board caps its reading, so the floor still guards the end of the line the pooled
// trips skip but never reads one pattern's layover over service that boards more often (fixtures
// cut from the cached zips for 2026-10-21).
async function weekdayRow(fixture: string, slug: string, route: string, headsign: string, drawnFrom?: string) {
  const dir = resolve(__dirname, 'fixtures', fixture);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties)
    .filter((p: any) => p.stopId == null && p.routeShortName === route && p.day === 'Weekday' && p.headsign.includes(headsign))
    .filter((p: any) => drawnFrom == null || p.stopOrder[0] === drawnFrom);
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('a drop-off-only first stop floors, capped by the first boarding stop (CIV-234)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('LA Metro 40 to Redondo Beach: the evening stays every 30, the wait at the first ~25 stops', async () => {
    const row = await weekdayRow('lacmta-40-weekday', 'lacmta', '40', 'Redondo Beach');
    expect(row.dropOffOnlyStops).toContain('3708');
    expect(row.stopOrder[0]).toBe('3708');
    expect(row.headwayByPeriod.evening).toBe(30);
    expect(row.headwayByPeriod.midday).toBe(10);
  });

  it('TransLink 7 to Nanaimo Station: the PM peak stays every 15, the wait at the Dunbar end', async () => {
    const row = await weekdayRow('translink-007-weekday', 'translink', '007', 'Nanaimo');
    expect(row.dropOffOnlyStops).toEqual(['646', '695']);
    expect(row.stopOrder[0]).toBe('646');
    expect(row.headwayByPeriod.pmPeak).toBe(15);
  });

  it('LA Metro 210 to Redondo Beach: one pattern\'s layover no longer floors midday at 20 where the next stops board every 10', async () => {
    // The row drawn from the layover; the other pattern's row starts further on.
    const row = await weekdayRow('lacmta-210-weekday', 'lacmta', '210', 'Redondo Beach', '13000137');
    expect(row.dropOffOnlyStops).toEqual(['13000137']);
    expect(row.headwayByPeriod.midday).toBe(10);
    expect(row.headway).toBe(10);
    // The cap never raises a value: the evening keeps its 14.
    expect(row.headwayByPeriod.evening).toBe(14);
  });
});
