import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #961: MBTA 23 Sunday toward Ashmont. #897 withholds the row's own overnight value (a sparse
// window), but the direction value, read at the stretch's reference stop, kept the window's wait
// (196), and the card's fallback printed it as "every 196". A row whose own value was withheld
// now carries no direction overnight value either (fixture cut from the cached zip, 2026-10-25).
describe('a withheld overnight row has no direction overnight value (#961)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-25T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('MBTA 23 Sunday to Ashmont: no overnight number anywhere on the row', async () => {
    const dir = resolve(__dirname, 'fixtures', 'mbta-23-sunday');
    const zip = new JSZip();
    for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'mbta' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Sunday');
    const ashmont = rows.find((p: any) => p.headsign === 'Ashmont');
    expect(ashmont.headwayByPeriod.overnight).toBeNull();
    expect(ashmont.directionFilterHeadwayByPeriod.overnight).toBeNull();
    // The other direction's steady overnight value is untouched.
    const ruggles = rows.find((p: any) => p.headsign === 'Ruggles');
    expect(ruggles.headwayByPeriod.overnight).toBe(14);
  });
});
