/**
 * Pins the processed output of every standalone GTFS fixture, so a refactor of the headline
 * windows (HEADLINE_WINDOWS, RAIL_TIER_WINDOW, headlineWindowValue) can be shown to change nothing.
 * Each fixture is processed with the clock pinned inside its own calendar; the hash covers every
 * artifact the processor returns. If this fails after a deliberate rule change, review the
 * affected fixture's output first, then update the snapshot.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function csvColumn(file: string, column: string): string[] {
  if (!existsSync(file)) return [];
  const [header, ...lines] = readFileSync(file, 'utf8').replace(/^﻿/, '').trimEnd().split(/\r?\n/);
  const index = header.split(',').indexOf(column);
  return index < 0 ? [] : lines.map(line => line.split(',')[index]).filter(Boolean);
}

/** A Wednesday near the middle of the fixture's own service dates. */
function referenceDate(dir: string): Date {
  const dates = [
    ...csvColumn(join(dir, 'calendar.txt'), 'start_date'),
    ...csvColumn(join(dir, 'calendar.txt'), 'end_date'),
    ...csvColumn(join(dir, 'calendar_dates.txt'), 'date'),
  ].sort();
  const pick = dates[Math.floor(dates.length / 2)] ?? '20260304';
  const day = new Date(`${pick.slice(0, 4)}-${pick.slice(4, 6)}-${pick.slice(6, 8)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + ((3 - day.getUTCDay() + 7) % 7));
  return day;
}

async function zipDir(dir: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(join(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const fixtureNames = readdirSync(FIXTURES)
  .filter(name => existsSync(join(FIXTURES, name, 'stop_times.txt')) && existsSync(join(FIXTURES, name, 'trips.txt')))
  .sort();

describe('processed fixture output is pinned', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); });
  afterAll(() => { vi.useRealTimers(); });

  it('covers a meaningful set of fixtures', () => {
    expect(fixtureNames.length).toBeGreaterThan(40);
  });

  it('matches the recorded hash for every fixture', async () => {
    const out: Record<string, string> = {};
    for (const name of fixtureNames) {
      const dir = join(FIXTURES, name);
      vi.setSystemTime(referenceDate(dir));
      try {
        const result = await processAgencyFeeds(await zipDir(dir), [], { slug: name });
        const hash = createHash('sha1');
        for (const part of [result.geojson, result.corridorsGeojson, result.stopsJson, result.tripsJson, result.stopsMetaJson]) hash.update(part).update('\u0000');
        out[name] = `${result.featureCount} features ${hash.digest('hex').slice(0, 12)}`;
      } catch (e) {
        out[name] = `error: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`;
      }
    }
    expect(out).toMatchSnapshot();
  }, 300_000);
});
