/** CIV-1252: the upcoming network is the map's processing of a held zip at its own first week, in its own keys. */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds.js';
import { peekFeedDates } from '../archiveSelection.js';
import { buildUpcoming, mergeUpcomingIndex, upcomingRefusal, UPCOMING_PREFIX, type UpcomingEntry } from '../upcomingNetwork.js';

const DIR = resolve(__dirname, 'fixtures', 'ncsu-wolfline-41-semester');
let buf: Buffer;
let feedStart: string;
const agency = { slug: 'ncsu-wolfline' };

beforeAll(async () => {
  const zip = new JSZip();
  for (const file of readdirSync(DIR)) zip.file(file, readFileSync(resolve(DIR, file)));
  buf = await zip.generateAsync({ type: 'nodebuffer' });
  feedStart = (await peekFeedDates(buf)).feedStart!;
});

const entry = (slug: string, start: string): UpcomingEntry => ({ slug, feedStart: start, feedExpiry: null, feedVersion: null, sourceKey: 'k', referenceDate: start, serviceWeekStart: null, routes: 1, stops: 1 });

describe('upcomingRefusal', () => {
  it('only a timetable that starts after today is upcoming', () => {
    expect(upcomingRefusal('20261107', '20261103')).toBeNull();
    expect(upcomingRefusal('20261103', '20261103')).toMatch(/already started/);
    expect(upcomingRefusal('20261001', '20261103')).toMatch(/already started/);
    expect(upcomingRefusal(null, '20261103')).toMatch(/no first service date/);
  });
});

describe('buildUpcoming', () => {
  it('is the map\'s processing of the zip anchored at its first service date, written only under atlas/upcoming/', async () => {
    const today = '20241201';
    expect(feedStart > today).toBe(true);
    const built = await buildUpcoming(buf, agency, { todayYmd: today, sourceKey: 'gtfs/archive/x/y.zip' });
    const direct = await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] }, { serviceAnchor: feedStart });
    expect(built.files.get(`${UPCOMING_PREFIX}/ncsu-wolfline.json`)).toBe(direct.geojson);
    expect(built.files.get(`${UPCOMING_PREFIX}/ncsu-wolfline-stops.json`)).toBe(direct.stopsJson);
    expect([...built.files.keys()].every(k => k.startsWith(`${UPCOMING_PREFIX}/`))).toBe(true);
    expect(built.entry).toMatchObject({ slug: 'ncsu-wolfline', feedStart, referenceDate: direct.referenceDate, serviceWeekStart: direct.serviceWeekStart, sourceKey: 'gtfs/archive/x/y.zip' });
    expect(built.entry.referenceDate).toMatch(/^\d{8}$/);
    expect(built.entry.routes).toBeGreaterThan(0);
  });

  it('refuses a timetable that has started, and agencies with supplemental feeds', async () => {
    await expect(buildUpcoming(buf, agency, { todayYmd: feedStart, sourceKey: 'k' })).rejects.toThrow(/already started/);
    await expect(buildUpcoming(buf, { slug: 'x', supplementalFeedUrls: ['u'] }, { todayYmd: '20241201', sourceKey: 'k' })).rejects.toThrow(/supplemental/);
  });
});

describe('mergeUpcomingIndex', () => {
  it('replaces the slug\'s entry, keeps other upcoming ones and drops ones that started', () => {
    const existing = { generatedAt: 'old', agencies: [entry('tank', '20261107'), entry('old', '20261101'), entry('zed', '20270101')] };
    const merged = mergeUpcomingIndex(existing, { ...entry('tank', '20261107'), routes: 9 }, '20261103', 'now');
    expect(merged.generatedAt).toBe('now');
    expect(merged.agencies.map(a => [a.slug, a.routes])).toEqual([['tank', 9], ['zed', 1]]);
    expect(mergeUpcomingIndex(null, entry('a', '20261201'), '20261103', 'now').agencies).toHaveLength(1);
  });
});

describe('publish-upcoming.ts', () => {
  const src = readFileSync(resolve(__dirname, '../publish-upcoming.ts'), 'utf8');
  it('writes only with ATLAS_ENV=staging, refuses production, and puts the index last', () => {
    expect(src).toMatch(/if \(!stagingRequested\(\)\) throw/);
    expect(src).toMatch(/if \(isProductionPublicR2Bucket\(\)\) throw/);
    expect(src.lastIndexOf('r2Put(upcomingIndexKey')).toBeGreaterThan(src.indexOf('for (const [key, body] of built.files) console.log(`put'));
    expect(src).not.toMatch(/stampFeedMeta|release\.json|pmtiles|index\.json'\), JSON/);
  });
});
