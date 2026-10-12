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
  const zip = new JSZip();
  const dir = resolve(__dirname, 'fixtures', 'ttc-29-dufferin-full');
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'ttc' });
  const fc = JSON.parse(result.geojson) as GeoJSON.FeatureCollection;
  // The app normalizes loaded agency JSON the same way (worst-direction stamps).
  normalizeRouteFilterFeatures(fc.features as any);
  for (const f of fc.features) (f.properties as any).agencySlug = 'ttc';
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
});
