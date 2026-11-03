import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';

// #1255: the rider wait (CIV-1161, gated by CIV-1204) is read at the main stretch's reference stop, the stop the filter
// and the card read. As a median over every main-stretch stop it read the all-day fallback where the one regular pattern
// is a minor one: Pace 542 weekday (a 6-trip pattern; the 22-trip every-30 pattern alternates with it) read 337, and
// MATA 30 Saturday (a 3-trip pattern) read 240. One-route cuts of the agencies' zips (2026-10-31).

function csvColumn(file: string, column: string): string[] {
  if (!existsSync(file)) return [];
  const [header, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/);
  const index = header.split(',').indexOf(column);
  return index < 0 ? [] : lines.map(line => line.split(',')[index]).filter(Boolean);
}

/** A Wednesday a week after the fixture's earliest start date, inside every service period it has. */
function runDate(dir: string): Date {
  const starts = csvColumn(join(dir, 'calendar.txt'), 'start_date').sort();
  const pick = starts.at(-1) ?? '20261031';
  const day = new Date(`${pick.slice(0, 4)}-${pick.slice(4, 6)}-${pick.slice(6, 8)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 7 + ((3 - day.getUTCDay() + 7) % 7));
  return day;
}

async function rows(fixture: string, slug: string, day: string) {
  const dir = join(import.meta.dirname, 'fixtures', fixture);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(runDate(dir));
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(join(dir, file)));
  const result = await processAgencyFeeds(await zip.generateAsync({ type: 'nodebuffer' }), [], { slug } as never);
  return JSON.parse(result.geojson).features
    .map((f: { properties: Record<string, any> }) => f.properties)
    .filter((p: Record<string, any>) => p.stopId == null && p.day === day && p.tier !== 'span');
}

describe('rider wait at the reference stop (#1255)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('Pace 542 weekday reads about every 30, not the 6-trip stops\' 337', async () => {
    const weekday = await rows('pace-542', 'pace-bus', 'Weekday');
    expect(weekday.length).toBeGreaterThan(0);
    for (const p of weekday) expect(p.headway).toBeLessThanOrEqual(35);
  }, 30_000);

  it('MATA 30 Saturday reads about every 120, not the 3-trip stops\' 240', async () => {
    const saturday = await rows('mata-30', 'mata', 'Saturday');
    expect(saturday.length).toBeGreaterThan(0);
    for (const p of saturday) expect(p.headway).toBeLessThanOrEqual(130);
  }, 30_000);
});
