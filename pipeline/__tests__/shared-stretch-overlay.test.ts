import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { normalizeRouteFilterFeatures, routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { computeFrequencySegmentOverlay, failingRouteSharedRanges } from '../../src/utils/frequencySegments';
import { buildRouteStopMetric } from '../../src/utils/routeFacts';
import { sharedStretchHeadway } from '../../src/utils/routeCardTrunk';
import { buildSharedStopIndex } from '../../shared/sharedStops';

// CIV-82 phase 2: a route that fails the active filter may draw only the shared stretches whose
// pooled stop values pass the same filter in both directions. It still fails everywhere else.

// TTC 29 at real stop spacing (every stop, trips starting 6-11 AM): the opposite-direction stop
// across the street must exist for the both-directions check.
async function ttc29(): Promise<GeoJSON.FeatureCollection> {
  return processed('ttc-29-dufferin-full', 'ttc');
}

async function processed(fixture: string, slug: string): Promise<GeoJSON.FeatureCollection> {
  const zip = new JSZip();
  const dir = resolve(__dirname, 'fixtures', fixture);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug });
  const fc = JSON.parse(result.geojson) as GeoJSON.FeatureCollection;
  // The app normalizes loaded agency JSON the same way (worst-direction stamps).
  normalizeRouteFilterFeatures(fc.features as any);
  for (const f of fc.features) (f.properties as any).agencySlug = slug;
  return fc;
}

const weekday = (fc: GeoJSON.FeatureCollection) => ({
  ...fc,
  features: fc.features.filter(f => f.geometry.type !== 'LineString' || (f.properties as any).day === 'Weekday'),
});
const lineProps = (fc: GeoJSON.FeatureCollection) => fc.features
  .filter(f => f.geometry.type === 'LineString')
  .map(f => f.properties as any);
const strip = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => ({
  ...fc,
  features: fc.features.map(f => {
    const { sharedStretches, sharedStops, ...rest } = (f.properties ?? {}) as any;
    return { ...f, properties: rest };
  }),
});

describe('failing routes draw only their passing shared stretches', () => {
  it('TTC 29 fails every 15 but draws its shared stretch in both directions; the 29C tail stays hidden', async () => {
    const fc = weekday(await ttc29());
    const routes = lineProps(fc);
    for (const period of ['all', 'amPeak'] as const) {
      // The route itself fails (each branch every 16).
      expect(routePassesHeadwayFilter(routes, period, 'Weekday', 15)).toBe(false);
      const result = failingRouteSharedRanges(fc.features, fc.features, period, 15);
      const byHeadsign = new Map(result.map(r => [(r.feature.properties as any).headsign, r]));
      const a = byHeadsign.get('Exhibition (Dufferin Gate)');
      const c = byHeadsign.get("Exhibition (Princes' Gates)");
      const north = byHeadsign.get('Wilson');
      expect(a && c && north).toBeTruthy();
      const aProps = a!.feature.properties as any;
      const cProps = c!.feature.properties as any;
      // 29A: the shared stops draw (its last, drop-off-only stop does not pool).
      expect(a!.ranges[0][0]).toBe(0);
      expect(a!.ranges.at(-1)![1]).toBeGreaterThanOrEqual(aProps.stopOrder.length - 3);
      // 29C: nothing past 29A's stops (its tail is 29C-only, every 16).
      const lastShared = cProps.stopOrder.findIndex((s: string) => s === aProps.stopOrder.at(-2));
      for (const [, to] of c!.ranges) expect(to).toBeLessThanOrEqual(lastShared);
      expect(north!.ranges.length).toBeGreaterThan(0);
      // Colours come from the tier palette of the worst filter value (every 8 here).
      for (const v of a!.values.values()) expect(v).toBeLessThanOrEqual(15);
    }
    const overlay = computeFrequencySegmentOverlay({ ttc: fc } as any, 'all', 15);
    expect(overlay.segments.some(s => s.properties.routeId === '29')).toBe(true);
    // Never a partial match: the failing route's own line stays filtered out.
    expect(overlay.partialMatches.some(k => k.routeId === '29')).toBe(false);
  });

  it('draws nothing when the opposite direction fails at the matching stops', async () => {
    const fc = weekday(await ttc29());
    // Northbound loses its pooled data and runs every 30 at every stop.
    for (const f of fc.features) {
      const p = f.properties as any;
      if (f.geometry.type !== 'LineString' || p.directionId !== 1) continue;
      delete p.sharedStretches;
      delete p.sharedStops;
      for (const id of Object.keys(p.stopHeadways ?? {})) p.stopHeadways[id] = 30;
      for (const id of Object.keys(p.stopPeriodHeadways ?? {})) {
        for (const pk of Object.keys(p.stopPeriodHeadways[id])) p.stopPeriodHeadways[id][pk] = 30;
      }
    }
    for (const period of ['all', 'amPeak'] as const) {
      expect(failingRouteSharedRanges(fc.features, fc.features, period, 15)).toEqual([]);
    }
  });

  it('draws nothing new without pooled data (today\'s live data), and counts never change', async () => {
    const fc = weekday(await ttc29());
    const bare = strip(fc);
    for (const period of ['all', 'amPeak', 'midday'] as const) {
      for (const max of [10, 15, 20, 30]) {
        expect(failingRouteSharedRanges(bare.features, bare.features, period, max)).toEqual([]);
        // Route pass/fail (lists, counts, agency cards) is identical with and without pooled data.
        expect(routePassesHeadwayFilter(lineProps(fc), period, 'Weekday', max))
          .toBe(routePassesHeadwayFilter(lineProps(bare), period, 'Weekday', max));
        const withData = computeFrequencySegmentOverlay({ ttc: fc } as any, period, max);
        const without = computeFrequencySegmentOverlay({ ttc: bare } as any, period, max);
        expect(withData.partialMatches).toEqual(without.partialMatches);
        expect(without.segments.some(s => s.properties.routeId === '29')).toBe(false);
      }
    }
  });

  it('stop card and route card read the same pooled value as the map', async () => {
    const fc = weekday(await ttc29());
    const routes = lineProps(fc);
    const index = buildSharedStopIndex(fc.features);
    const a = routes.find(p => p.headsign === 'Exhibition (Dufferin Gate)');
    const stopId = a.stopOrder[3];
    const stopMetric = buildRouteStopMetric(a, stopId, index);
    expect(stopMetric.value).toBe(8);
    expect(stopMetric.provenance).toBe('shared-stretch');
    expect(buildRouteStopMetric(a, stopId).value).toBe(16);
    const south = routes.filter(p => p.directionId === 0);
    expect(sharedStretchHeadway(routes, south, 'all')?.headway).toBe(8);
    expect(sharedStretchHeadway(lineProps(strip(fc)), south, 'all')).toBeNull();
  });

  // Rail: one direction splits into two branches (pooled), the other runs as ONE headsign that
  // already counts every trip. The single-pattern direction draws along the paired stops too.
  // Cut from the 2026-10 feeds: one weekday, trips starting 7 AM to noon, every stop, so the
  // all-day value (the midday median) is the one these fixtures can judge.
  for (const [fixture, slug, single, branches, max] of [
    ['nyct-b-subway', 'nyct-subway', 'Beach', ['Park Blvd', '145 St'], 15],
    ['cta-green-line', 'cta', 'Harlem-Green', ['East 63rd-Cottage Grove', 'Ashland/63rd'], 15],
  ] as const) {
    it(`${slug} ${single}: the single-pattern direction draws where both directions pass`, async () => {
      const fc = weekday(await processed(fixture, slug));
      const routes = lineProps(fc);
      const one = routes.filter(p => p.headsign === single);
      expect(one).toHaveLength(1);
      expect(one[0].sharedStretches).toBeUndefined();
      expect(routePassesHeadwayFilter(routes, 'all', 'Weekday', max)).toBe(false);
      const result = failingRouteSharedRanges(fc.features, fc.features, 'all', max);
      const drawn = new Map(result.map(r => [(r.feature.properties as any).headsign, r]));
      expect(drawn.has(single)).toBe(true);
      expect(branches.some(h => drawn.has(h))).toBe(true);
      // Symmetric: the single direction's drawn stops lie across from drawn branch stops.
      const singleStops = drawn.get(single)!.ranges.reduce((n, [a, b]) => n + b - a + 1, 0);
      const branchStops = Math.max(...branches.map(h => drawn.get(h)?.ranges.reduce((n, [a, b]) => n + b - a + 1, 0) ?? 0));
      expect(singleStops).toBeGreaterThan(branchStops / 3);
      // Never a partial match, and the route still fails.
      const overlay = computeFrequencySegmentOverlay({ [slug]: fc } as any, 'all', max);
      expect(overlay.partialMatches.some(k => k.headsign === single)).toBe(false);
      // Without pooled data neither direction draws anything new.
      const bare = strip(fc);
      expect(failingRouteSharedRanges(bare.features, bare.features, 'all', max)).toEqual([]);
    });
  }
});
