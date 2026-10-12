import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #774: NCSU Wolfline gives every service a 2025-2027 calendar.txt period and switches the
// semester and summer timetables with calendar_dates removals only. The detected reference
// (the period midpoint, Jul 2 2026) always read the summer timetable. Fixture: the real feed's
// routes 41 and 40, each trip's first and last stop, calendar files unchanged.
const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekday(options: { referenceDateFromRunDate?: boolean }) {
  const result = await processGtfsBuffer(await fixtureZip('ncsu-wolfline-41-semester'), undefined, { slug: 'ncsu-wolfline', ...options });
  return JSON.parse(result.geojson).features
    .map((f: any) => f.properties)
    .filter((p: any) => p.day === 'Weekday' && p.stopId == null);
}

describe('referenceDateFromRunDate (#774)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('reads the fall semester timetable during the semester', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') });
    const features = await weekday({ referenceDateFromRunDate: true });
    // Route 41 runs every 11 07:00-18:00 on 74000.218963; route 40 runs only in the semester.
    expect(features.find((p: any) => p.routeShortName === '41')?.headway).toBe(11);
    expect(features.some((p: any) => p.routeShortName === '40')).toBe(true);
  });

  it('reads the summer timetable in summer', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-07-01T12:00:00') });
    const features = await weekday({ referenceDateFromRunDate: true });
    expect(features.find((p: any) => p.routeShortName === '41')?.headway).toBe(15);
    expect(features.some((p: any) => p.routeShortName === '40')).toBe(false);
  });

  it('keeps the detected reference date without the opt-in', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') });
    const features = await weekday({});
    expect(features.find((p: any) => p.routeShortName === '41')?.headway).toBe(15);
  });
});
