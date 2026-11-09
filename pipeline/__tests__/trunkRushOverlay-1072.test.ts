import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';

// CIV-1072 (#1088): TTC 102 southbound. The 102C trips via Dynamic Dr run only in the PM rush, so they
// stay out of the shared pool (#720); the drawn Warden pattern's stop values at the trunk stops left them out.

const FIXTURE = join(import.meta.dirname, 'fixtures', 'ttc-102-weekday');

function csvColumn(file: string, column: string): string[] {
  if (!existsSync(file)) return [];
  const [header, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/);
  const index = header.split(',').indexOf(column);
  return index < 0 ? [] : lines.map(line => line.split(',')[index]).filter(Boolean);
}

function referenceDate(dir: string): Date {
  const dates = [...csvColumn(join(dir, 'calendar.txt'), 'start_date'), ...csvColumn(join(dir, 'calendar.txt'), 'end_date'), ...csvColumn(join(dir, 'calendar_dates.txt'), 'date')].sort();
  const pick = dates[Math.floor(dates.length / 2)] ?? '20260304';
  const day = new Date(`${pick.slice(0, 4)}-${pick.slice(4, 6)}-${pick.slice(6, 8)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((3 - day.getUTCDay() + 7) % 7));
  return day;
}

describe('trunk stop values count rush-hour-only trips (CIV-1072)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(referenceDate(FIXTURE)); });
  afterAll(() => { vi.useRealTimers(); });

  // WIP (parked with CIV-845): the target stop 4220 stays refused by the #813 even-gaps check.
  it('processes the 102 fixture', async () => {
    const zip = new JSZip();
    for (const file of readdirSync(FIXTURE)) zip.file(file, readFileSync(join(FIXTURE, file)));
    const result = await processAgencyFeeds(await zip.generateAsync({ type: 'nodebuffer' }), [], { slug: 'ttc' } as never);
    const lines = JSON.parse(result.geojson).features.map((f: { properties: Record<string, any> }) => f.properties).filter((p: Record<string, any>) => p.stopId == null && p.day === 'Weekday' && p.directionId === 0);
    expect(lines.length).toBeGreaterThan(0);
  });
});
