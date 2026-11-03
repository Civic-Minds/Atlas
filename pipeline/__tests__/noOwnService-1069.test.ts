import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';

// CIV-1069: a headsign with under three of its own departures in a period shows a value read from
// other headsigns' trips at its terminal stop. The value stays (the route filter reads it); the
// feature lists those periods in noOwnServiceByPeriod so its card row reads Irregular.

const FIXTURE = join(import.meta.dirname, 'fixtures', 'cta-77-weekday');

function csvColumn(file: string, column: string): string[] {
  if (!existsSync(file)) return [];
  const [header, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/);
  const index = header.split(',').indexOf(column);
  return index < 0 ? [] : lines.map(line => line.split(',')[index]).filter(Boolean);
}

/** The pin test's clock: a Wednesday near the middle of the fixture's service dates. */
function referenceDate(dir: string): Date {
  const dates = [...csvColumn(join(dir, 'calendar.txt'), 'start_date'), ...csvColumn(join(dir, 'calendar.txt'), 'end_date'), ...csvColumn(join(dir, 'calendar_dates.txt'), 'date')].sort();
  const pick = dates[Math.floor(dates.length / 2)] ?? '20260304';
  const day = new Date(`${pick.slice(0, 4)}-${pick.slice(4, 6)}-${pick.slice(6, 8)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((3 - day.getUTCDay() + 7) % 7));
  return day;
}

describe('periods a headsign does not run itself (CIV-1069)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(referenceDate(FIXTURE)); });
  afterAll(() => { vi.useRealTimers(); });

  it('flags CTA 77 Belmont & Octavia, keeps its value, and leaves a headsign with its own trips alone', async () => {
    const zip = new JSZip();
    for (const file of readdirSync(FIXTURE)) zip.file(file, readFileSync(join(FIXTURE, file)));
    const result = await processAgencyFeeds(await zip.generateAsync({ type: 'nodebuffer' }), [], { slug: 'cta' } as never);
    const lines = JSON.parse(result.geojson).features.map((f: { properties: Record<string, any> }) => f.properties).filter((p: Record<string, any>) => p.stopId == null && p.day === 'Weekday');
    const octavia = lines.find((p: Record<string, any>) => p.headsign === 'Belmont & Octavia');
    expect(octavia.noOwnServiceByPeriod).toEqual(expect.arrayContaining(['amPeak', 'midday']));
    expect(octavia.headwayByPeriod.amPeak).toBe(10); // the filter still reads the stop's value
    const cumberland = lines.find((p: Record<string, any>) => p.headsign === 'Belmont & Cumberland Terminal');
    expect(cumberland.headwayByPeriod.amPeak).toBe(10);
    expect(cumberland.noOwnServiceByPeriod).toBeUndefined();
  });
});
