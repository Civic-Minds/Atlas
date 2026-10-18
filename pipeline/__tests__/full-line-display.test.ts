import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { decodeStopRuns } from '../../shared/stopRuns';

// CIV-321 S4: GO KI weekday toward Union draws on the Mount Pleasant short turn (featureDedupe keeps one
// shape per slot), so Kitchener to Georgetown was missing from the map. The row now carries the slot's
// longest rated pattern (the Kitchener trains) as display-only fields for the section colours, while its
// own geometry, stops and values stay as they were (fixture: one week cut from the cached zip).
describe('a row carries its slot\'s full line for display only (CIV-321 S4)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('GO KI to Union: the full line runs from Kitchener, its section values follow it, the row is unchanged', async () => {
    const dir = resolve(__dirname, 'fixtures', 'go-ki-week');
    const zip = new JSZip();
    for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'go' });
    const row = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.headsign === 'Union Station GO');
    expect(row.stopOrder).toEqual(['MO', 'BR', 'BE', 'MA', 'ET', 'WE', 'MD', 'BL', 'UN']);
    expect(row.fullStopOrder).toEqual(['KI', 'GL', 'AC', 'GE', 'MO', 'BR', 'BE', 'MA', 'ET', 'WE', 'MD', 'BL', 'UN']);
    expect(row.fullStopPositions).toHaveLength(13);
    expect(row.fullLine.length).toBeGreaterThan(2);
    const midday = decodeStopRuns(row.stretchStopPeriodValues.midday);
    expect(midday).toHaveLength(13);
    // Two midday trains reach Kitchener; the inner part runs every 26-30, Etobicoke North (skipped by
    // some trains) reads the trains through it.
    expect(midday[0]).toBeGreaterThan(120);
    expect(midday[8]).toBe(29);
  });
});
