import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { decodeStopRuns } from '../../shared/stopRuns';
import { processAgencyFeeds } from '../agencyFeeds';
import { applyAgencySections, SECTION_FIELDS, type AgencySections } from '../../shared/agencySections';

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

// CIV-321: the section fields live in a separate beta-only file, so the public route file does not grow.
describe('the section fields move to the agency sections file', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  async function goKiZip() {
    const dir = resolve(__dirname, 'fixtures', 'go-ki-week');
    const zip = new JSZip();
    for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  const isLine = (f: any) => f.properties.stopId == null;

  it('route file has none of them; putting the file back gives the full features', async () => {
    const buf = await goKiZip();
    const full = JSON.parse((await processGtfsBuffer(buf, undefined, { slug: 'go' })).geojson).features;
    const result = await processAgencyFeeds(buf, [], { slug: 'go' } as any);
    const routes = JSON.parse(result.geojson).features;
    routes.forEach((f: any, i: number) => {
      for (const field of SECTION_FIELDS) expect(f.properties[field]).toBeUndefined();
      // The main stretch's values stay on the route file for public route cards (CIV-937); the tails' move.
      expect(f.properties.stretchMeta?.main?.period).toEqual(full[i].properties.stretchMeta?.main?.period);
      expect(f.properties.stretchMeta?.main?.noRegular).toEqual(full[i].properties.stretchMeta?.main?.noRegular);
      for (const t of f.properties.stretchMeta?.tails ?? []) expect(t.period).toBeUndefined();
    });
    expect(routes.some((f: any) => f.properties.stretchMeta?.main?.period)).toBe(true);
    expect(full.some((f: any) => f.properties.fullLine)).toBe(true);
    expect(applyAgencySections(routes, JSON.parse(result.sectionsJson) as AgencySections)).toEqual(full);
  });

  it('a supplemental feed repeating the main feed\'s routes numbers on, so each row gets its own entry', async () => {
    const buf = await goKiZip();
    const full = JSON.parse((await processGtfsBuffer(buf, undefined, { slug: 'go' })).geojson).features;
    const result = await processAgencyFeeds(buf, [{ url: 'supp', buf }], { slug: 'go', supplementalFeedUrls: ['supp'] } as any);
    const file = JSON.parse(result.sectionsJson) as AgencySections;
    expect(Object.keys(file.sections).some(k => k.endsWith('#1'))).toBe(true);
    expect(applyAgencySections(JSON.parse(result.geojson).features, file)).toEqual([...full, ...full]);
  });

  it('a sections file from another run is ignored', async () => {
    const buf = await goKiZip();
    const result = await processAgencyFeeds(buf, [], { slug: 'go' } as any);
    const routes = JSON.parse(result.geojson).features;
    const file = JSON.parse(result.sectionsJson) as AgencySections;
    const fewer = routes.filter((f: any, i: number) => !(isLine(f) && i === routes.findIndex(isLine)));
    expect(applyAgencySections(fewer, file)).toEqual(fewer);
  });
});
