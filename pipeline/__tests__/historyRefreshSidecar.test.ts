/**
 * CIV-1101 Part B: the weekly refresh's History sidecar records the week the processor read, for
 * the main feed and a supplemental one (LA Metro's rail shape: a supplemental feed on the old
 * next-service-dates opt-in), and an unchanged feed whose picked week moved keeps its first sidecar.
 * Real MDOT MTA bus + subway fixture (fixtures/mdot-mta-bus-rail), in-memory sidecar store.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { processAgencyFeeds, type AgencyFeedConfig, type AgencyFeedResult } from '../agencyFeeds.js';
import { historyV2InputFor, writeRefreshSidecar } from '../historyRefreshSidecar.js';
import type { HistoryV2Sink } from '../historyV2.js';

const FIXTURE = join(import.meta.dirname, 'fixtures/mdot-mta-bus-rail');
const SUBWAY_URL = 'https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_metro.zip';
const BUS_URL = 'https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_localbus.zip';
// LA Metro shape: the rail supplemental was read on next-service dates by the old picker.
const agency: AgencyFeedConfig = { slug: 'mta-maryland', feedUrl: BUS_URL, supplementalFeedUrls: [SUBWAY_URL], nextServiceDatesFeedUrls: [SUBWAY_URL] };

async function zipFixture(name: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(join(FIXTURE, name))) zip.file(file, readFileSync(join(FIXTURE, name, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function memoryStore() {
  const objects = new Map<string, string>();
  const sink: HistoryV2Sink = {
    async put(key, body) {
      const existing = objects.get(key);
      if (existing != null) return existing === body ? 'unchanged' : 'conflict';
      objects.set(key, body);
      return 'written';
    },
  };
  return { objects, store: { sink, peek: async (key: string) => objects.get(key) ?? null } };
}

let bus: Buffer;
let subway: Buffer;
const runAt = async (anchor: string) => processAgencyFeeds(bus, [{ url: SUBWAY_URL, buf: subway }], agency, { serviceAnchor: anchor });
const features = (r: AgencyFeedResult) => JSON.parse(r.geojson).features;

beforeAll(async () => {
  bus = await zipFixture('bus');
  subway = await zipFixture('metro-subway');
});

describe('refresh History sidecar (writeRefreshSidecar)', () => {
  it('stores the date the processor read, for the main and the supplemental feed', async () => {
    const result = await runAt('20260302');
    // Fixed by the fixture's calendars, not read back from the code under test.
    expect(result.referenceDate).toBe('20260304');
    expect(result.supplementalFeatureCounts.map(f => f.referenceDate)).toEqual(['20260304']);
    const { objects, store } = memoryStore();
    const out = await writeRefreshSidecar('mta-maryland', '20260613', features(result), historyV2InputFor(result, bus, [{ url: SUBWAY_URL, buf: subway }]), store);
    const stored = JSON.parse(objects.get('history-v2/mta-maryland/20260613.json')!);
    expect(stored.refDate).toBe('20260304');
    expect(stored.refDateQuality).toMatchObject({ holiday: false, pickedBy: 'vote', weekStart: '20260302' });
    expect(Object.keys(stored.supplementalRoutes ?? {})).toEqual([SUBWAY_URL]);
    expect(out.note).toBe('');
  }, 120_000);

  it('never re-picks for a supplemental feed without the processor\'s date', async () => {
    const result = await runAt('20260302');
    const input = { ...historyV2InputFor(result, bus, [{ url: SUBWAY_URL, buf: subway }]), supplementalReferenceDates: {} };
    await expect(writeRefreshSidecar('mta-maryland', '20260613', features(result), input, memoryStore().store)).rejects.toThrow(/no processor reference date for supplemental feed/);
  }, 120_000);

  it('an unchanged feed whose week moved keeps the period\'s first sidecar, and says so', async () => {
    const { objects, store } = memoryStore();
    const first = await runAt('20260302');
    await writeRefreshSidecar('mta-maryland', '20260613', features(first), historyV2InputFor(first, bus, [{ url: SUBWAY_URL, buf: subway }]), store);
    const before = objects.get('history-v2/mta-maryland/20260613.json');
    const later = await runAt('20260309');
    expect(later.referenceDate).toBe('20260311');
    const out = await writeRefreshSidecar('mta-maryland', '20260613', features(later), historyV2InputFor(later, bus, [{ url: SUBWAY_URL, buf: subway }]), store);
    expect(objects.get('history-v2/mta-maryland/20260613.json')).toBe(before);
    expect(out.note).toBe('; unchanged feed, sidecar kept (period 20260613 read 20260304; this run read 20260311)');
    expect(out.routes).toEqual(JSON.parse(before!).routes);
  }, 240_000);
});
