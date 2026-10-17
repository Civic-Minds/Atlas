import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-53: SEPTA 63 weekday toward Columbus Commons. One midday trip runs under "Food Center via
// Produce Market", a headsign whose only row is irregular, so it had no pool key and never joined
// the per-stop pools (#690). Its absence left one 24-30 minute hole in the merged list, the pool's
// evenness check rejected it, and each stop fell back to its own shape: 121 at stop 98 on the tail
// row starting at 188, 94 at 194 on the Produce Market row. Every direction-1 trip together runs
// every 12 there (GTFS, 2026-10-21). The trip now joins as a contributor only: it owns no row.
async function weekdayRows() {
  const dir = resolve(__dirname, 'fixtures', 'septa-63-weekday');
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'septa' });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.day === 'Weekday' && p.directionId === 1);
}

describe('a headsign with no eligible row still counts at shared stops (CIV-53)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('SEPTA 63 Columbus Commons rows read every 12 at the shared midday stops, not 121 or 94', async () => {
    const rows = await weekdayRows();
    const tail = rows.find((p: any) => p.headsign === 'Columbus Commons' && p.stopOrder[0] === '188');
    const produce = rows.find((p: any) => p.headsign === 'Columbus Commons via Produce Market');
    expect(tail.stopPeriodHeadways['98'].midday).toBe(12);
    expect(tail.stopPeriodHeadways['194'].midday).toBe(12);
    expect(produce.stopPeriodHeadways['194'].midday).toBe(12);
    // Stop 188 really is about hourly (only two shapes serve it), and the tail row keeps its 63.
    expect(tail.stopPeriodHeadways['188'].midday).toBe(63);
    expect(tail.headwayByPeriod.midday).toBe(63);
  });

  it('the contributing headsign owns no row values', async () => {
    const rows = await weekdayRows();
    const span = rows.find((p: any) => p.headsign === 'Food Center via Produce Market');
    expect(span.tier).toBe('span');
    expect(span.headwayByPeriod.midday).toBeNull();
  });
});
