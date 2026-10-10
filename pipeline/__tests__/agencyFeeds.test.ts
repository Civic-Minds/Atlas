import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { loadSupplementalFeeds, processAgencyFeeds, type AgencyFeedConfig } from '../agencyFeeds.js';
import { processGtfsBuffer } from '../process-core.js';
import { routeArtifactSchemaError } from '../../shared/artifactSchema.js';

function hm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/** One shaped route running every `headway` minutes, 07:00–19:00 weekdays. */
async function fixtureFeed(opts: { prefix: string; routeShortName: string; routeType: number; headway: number; lat: number }): Promise<Buffer> {
  const { prefix: p, routeShortName, routeType, headway, lat } = opts;
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Fixture Transit,https://example.test,America/New_York\n');
  zip.file('routes.txt', `route_id,route_short_name,route_long_name,route_type\n${p}r1,${routeShortName},${routeShortName} Line,${routeType}\n`);
  zip.file('stops.txt', `stop_id,stop_name,stop_lat,stop_lon\n${p}s1,${p} First,${lat},-78.88\n${p}s2,${p} Last,${lat + 0.02},-78.86\n`);
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20271231\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    `${p}sh,${lat},-78.88,1`,
    `${p}sh,${lat + 0.01},-78.87,2`,
    `${p}sh,${lat + 0.02},-78.86,3`,
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (let start = 7 * 60; start <= 19 * 60; start += headway) {
    const id = `${p}t${start}`;
    trips.push(`${p}r1,weekday,${id},${p} Last,0,${p}sh`);
    stopTimes.push(`${id},${hm(start)},${hm(start)},${p}s1,1`, `${id},${hm(start + 12)},${hm(start + 12)},${p}s2,2`);
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

const RAIL_URL = 'https://example.test/rail/google_transit.zip';
const agency: AgencyFeedConfig = { slug: 'fixture-metro', supplementalFeedUrls: [RAIL_URL] };

describe('processAgencyFeeds (main feed + supplementals)', () => {
  it('keeps supplemental rail routes, keeps bus output unchanged, and stamps the schema version', async () => {
    const bus = await fixtureFeed({ prefix: 'bus', routeShortName: '4', routeType: 3, headway: 30, lat: 42.88 });
    const rail = await fixtureFeed({ prefix: 'rail', routeShortName: 'MR', routeType: 0, headway: 10, lat: 42.9 });

    const result = await processAgencyFeeds(bus, [{ url: RAIL_URL, buf: rail }], agency);
    const artifact = JSON.parse(result.geojson);
    const routes = artifact.features.filter((f: any) => f.properties.routeShortName);

    expect(routeArtifactSchemaError(artifact, 'fixture-metro')).toBeNull();
    expect(routes.some((f: any) => f.properties.routeShortName === 'MR' && f.properties.routeType === 0)).toBe(true);
    expect(routes.some((f: any) => f.properties.routeShortName === '4' && f.properties.routeType === 3)).toBe(true);
    expect(result.supplementalFeatureCounts).toEqual([{ url: RAIL_URL, featureCount: expect.any(Number) }]);
    expect(result.supplementalFeatureCounts[0].featureCount).toBeGreaterThan(0);
    const stopsMeta = JSON.parse(result.stopsMetaJson);
    expect(stopsMeta.stopCount).toBe(stopsMeta.stops.length);
    expect(JSON.stringify(stopsMeta.stops)).toContain('rails1');
    expect(JSON.stringify(stopsMeta.stops)).toContain('buss1');

    // The main feed's own features are exactly what processing it alone produces.
    const busOnly = JSON.parse((await processGtfsBuffer(bus, undefined, { slug: 'fixture-metro', force: false })).geojson);
    expect(artifact.features.slice(0, busOnly.features.length)).toEqual(busOnly.features);
  });

  it('stamps the schema version when an agency has no supplementals', async () => {
    const bus = await fixtureFeed({ prefix: 'bus', routeShortName: '4', routeType: 3, headway: 30, lat: 42.88 });
    const result = await processAgencyFeeds(bus, [], { slug: 'bus-only' });
    expect(routeArtifactSchemaError(JSON.parse(result.geojson), 'bus-only')).toBeNull();
  });

  it('refuses to build main-only output when a configured supplemental is not provided', async () => {
    const bus = await fixtureFeed({ prefix: 'bus', routeShortName: '4', routeType: 3, headway: 30, lat: 42.88 });
    await expect(processAgencyFeeds(bus, [], agency)).rejects.toThrow(/missing 1 configured supplemental/);
  });

  it('fails closed when a supplemental download fails or is not a zip', async () => {
    await expect(loadSupplementalFeeds(agency, async () => { throw new Error('HTTP 503'); })).rejects.toThrow(/HTTP 503/);
    await expect(loadSupplementalFeeds(agency, async () => Buffer.from('<html>'))).rejects.toThrow(/not a ZIP/);
  });
});

describe('every artifact-writing path uses the shared agency feed loader', () => {
  const root = resolve(__dirname, '../..');
  const paths = [
    'pipeline/process-gtfs.ts',
    'pipeline/refresh.ts',
    'pipeline/reprocess-derived-artifacts.ts',
    'pipeline/restore-active-feeds.ts',
    'scripts/publish-stops-meta-only.ts',
  ];

  it.each(paths)('%s loads supplementals and processes through processAgencyFeeds', path => {
    const source = readFileSync(resolve(root, path), 'utf8');
    expect(source).toContain('loadSupplementalFeeds(');
    expect(source).toContain('processAgencyFeeds(');
    expect(source).not.toMatch(/processGtfsBuffer\(/);
  });

  it('no other pipeline or script publishes agency artifacts straight from processGtfsBuffer', () => {
    const offenders: string[] = [];
    for (const dir of ['pipeline', 'scripts']) {
      for (const name of readdirSync(resolve(root, dir))) {
        if (!/\.(ts|mjs)$/.test(name)) continue;
        const source = readFileSync(resolve(root, dir, name), 'utf8');
        // Publishing an agency artifact to R2 straight from processGtfsBuffer drops supplementals.
        const publishesArtifacts = /r2Put\(\s*`atlas\/\$\{/.test(source);
        if (publishesArtifacts && /processGtfsBuffer\(/.test(source)) offenders.push(`${dir}/${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
