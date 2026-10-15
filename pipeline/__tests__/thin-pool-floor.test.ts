import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-221: the worst-drawn-stop floor (#771) used to skip a pooled stop whose pooled reading
// fell back to its own pattern, on the assumption that other patterns serve it. Where the other
// patterns add under three departures in the window, the stop's service is the merged list's
// plain wait, and it floors the row.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('thin-pool fallback stops floor the period values', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('TriMet 72 Saturday toward Clackamas: two departures from a same-stop-list shape count, so the first stop floors the morning at 33, not its own 51', async () => {
    const result = await processGtfsBuffer(await fixtureZip('trimet-72-6-floor'), undefined, { slug: 'trimet' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.routeId === '72' && p.directionId === 1);
    const sat = rows.find((p: any) => p.day === 'Saturday');
    // The first stop's own reading is 51 (three own departures); the merged list with the two
    // same-stop-list departures reads 33, and the row floors there rather than at the pool's 32
    // or the own list's 51.
    expect(sat.stopPeriodHeadways[sat.stopOrder[0]].amPeak).toBe(51);
    expect(sat.headwayByPeriod.amPeak).toBe(33);
    expect(sat.headwayByPeriod.midday).toBe(24);
  });

  it('TriMet 6 weekday toward Goose Hollow: the Hayden Meadows loop, served by no other pattern, floors the evening at its own 32', async () => {
    const result = await processGtfsBuffer(await fixtureZip('trimet-72-6-floor'), undefined, { slug: 'trimet' });
    const rows = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null && p.routeId === '6' && p.directionId === 1);
    const wk = rows.find((p: any) => p.day === 'Weekday');
    // The pool at the terminal reads 15 in the evening; only every other bus serves the loop.
    expect(wk.headwayByPeriod.evening).toBe(32);
    expect(wk.headwayByPeriod.midday).toBe(30);
  });
});
