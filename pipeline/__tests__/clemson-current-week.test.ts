import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds';

// Clemson Area Transit (CIV-846, #1040): the feed is regenerated daily with services running to 2050,
// so the older reference-date pick read a week from deep inside that range and dropped the routes
// running now (Red, TL-17, TL-64 and others). Reference-date stage 4 reads the week from the run date,
// so Clemson needs no referenceDateFromRunDate switch. Fixture: the feed of 2026-10-27, shapes left out.

const FIXTURE = resolve(__dirname, 'fixtures/clemson-cat-2026-10');
const agency = JSON.parse(readFileSync(resolve(__dirname, '../../config/agencies/clemson-cat.json'), 'utf8'));

async function zipFixture(): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(FIXTURE)) zip.file(file, readFileSync(join(FIXTURE, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function routeDays(geojson: string): string[] {
  const lines = JSON.parse(geojson).features.filter((f: any) => f.properties.stopId == null);
  return [...new Set<string>(lines.map((f: any) => `${f.properties.routeId}|${f.properties.day}`))].sort();
}

describe('Clemson reads the current week (CIV-846)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T12:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('has no run-date switch: stage 4 reads the week from the run date', () => {
    expect(agency.referenceDateFromRunDate).toBeUndefined();
  });

  it('lists every route running this week', async () => {
    const buf = await zipFixture();
    const current = routeDays((await processAgencyFeeds(buf, [], agency)).geojson);
    expect(current).toEqual([
      'TL-17|Saturday', 'TL-17|Sunday', 'TL-17|Weekday', 'TL-23|Weekday',
      'TL-24|Saturday', 'TL-24|Sunday', 'TL-24|Weekday', 'TL-26|Saturday', 'TL-27|Saturday',
      'TL-3|Saturday', 'TL-3|Sunday', 'TL-3|Weekday', 'TL-64|Weekday', 'TL-68|Weekday',
      'TL-69|Weekday', 'TL-70|Weekday', 'TL-8|Sunday', 'TL-8|Weekday',
    ]);
    // The older pick (kept behind the kill switch) missed seven of them: the case this guards.
    const legacy = routeDays((await processAgencyFeeds(buf, [], agency, { legacyReferenceDate: true })).geojson);
    expect(current.filter(r => !legacy.includes(r))).toEqual([
      'TL-17|Saturday', 'TL-17|Sunday', 'TL-17|Weekday', 'TL-23|Weekday', 'TL-64|Weekday', 'TL-68|Weekday', 'TL-8|Sunday',
    ]);
  });
});
