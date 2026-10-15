import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #730: Coast NH route 40 labels direction_id on 16 of its 24 weekday trips and on none of its
// 24 Saturday trips. The route was never synthesized (it has labelled trips), so the Saturday
// inbound trips defaulted into direction 0 and the inbound line vanished on Saturday. Blank
// trips now take the direction the route's labelled trips use on their shape.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Coast NH 40 through processing (#730)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('draws both directions on Saturday as on weekdays, each hourly', async () => {
    const result = await processGtfsBuffer(await fixtureZip('coast-nh-40'), undefined, { slug: 'coast-nh' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
    for (const day of ['Weekday', 'Saturday']) {
      const byDir = rows.filter((p: any) => p.day === day).map((p: any) => [p.directionId, p.headsign, p.headway]).sort();
      expect(byDir).toEqual([
        [0, 'Borthwick Trolley Outbound via Islington', 60],
        [1, 'Downtown Portsmouth via Borthwick - Islington', 60],
      ]);
    }
  });
});
