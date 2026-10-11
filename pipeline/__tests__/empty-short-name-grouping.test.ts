import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer, routeGroupName } from '../process-core';
import { stampRouteIrregularDirection } from '../worst-direction';
import type { GeoJsonFeature } from '../geojson-types';

// #717: feeds with an empty route_short_name (clemson-cat, coast-rta and ~70 others) must not
// pool every route into one stop group. The fallback has to fire on '' too, not just undefined.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('empty route_short_name falls back to route_id for grouping (#717)', () => {
  it('routeGroupName falls back on missing, empty and whitespace-only short names', () => {
    expect(routeGroupName({ route_short_name: '' }, 'TL-136')).toBe('TL-136');
    expect(routeGroupName({ route_short_name: '   ' }, 'TL-136')).toBe('TL-136');
    expect(routeGroupName({}, 'TL-136')).toBe('TL-136');
    expect(routeGroupName(undefined, 'TL-136')).toBe('TL-136');
    expect(routeGroupName({ route_short_name: ' 5 ' }, 'r5')).toBe('5');
  });

  // Real coast-rta subset: the 10 direction-0 routes that end at Ivory Wilson Transfer Center
  // (stop TL-1), all with an empty short name and empty trip_headsign. Shapes kept for TL-136 only.
  //
  // Hand count, TL-136 (service TL-203, every day): four single-trip frequency windows departing
  // TL-20 at 06:00, 06:15, 13:15 and 14:30, reaching TL-1 at 07:00, 07:00, 14:00 and 15:10.
  //   AM peak 06-09 at TL-1: only 07:00 -> worst wait max(60, 120) = 120.
  //   PM peak 15-19 at TL-1: only 15:10 -> max(10, 230) = 230.
  //   Midday 09-15: 255 here (route-level departure 13:15); 300 once the route level counts
  //   one trip per single-trip window (arrival 14:00).
  //   Evening: no TL-136 trip runs after 15:10 -> no service.
  // Before the fix the stop group ""::0 held all 10 routes, giving AM 30 and evening 240.
  it('coast-rta TL-136 period coverage uses only its own trips', async () => {
    const result = await processGtfsBuffer(await fixtureZip('coast-rta-ivory-wilson-pool'), undefined, { slug: 'coast-rta' });
    const all = JSON.parse(result.geojson).features
      .map((f: any) => f.properties)
      .filter((p: any) => p.routeId != null && p.stopId == null);
    // Each route with 2+ trips a day is its own feature now; before, the "" dedupe key kept
    // only TL-136. (One-trip-a-day routes depend on the separate 2-departure minimum.)
    const routeIds = new Set(all.map((p: any) => p.routeId));
    for (const id of ['TL-129', 'TL-136', 'TL-140', 'TL-146', 'TL-175']) expect(routeIds.has(id)).toBe(true);
    const features = all.filter((p: any) => p.routeId === 'TL-136');
    expect(features.map((p: any) => p.day).sort()).toEqual(['Saturday', 'Sunday', 'Weekday']);
    for (const p of features) {
      expect(p.routeShortName).toBe(''); // display name is untouched
      // Headline/tier and midday come from the route-level count, which the single-trip
      // frequency-window fix (fix/phase1-frequency-route) changes; the terminal values don't.
      expect(p.periodCoverageHeadway).toMatchObject({ amPeak: 120, pmPeak: 230, evening: null });
    }
  });

  it('stampRouteIrregularDirection keeps routes with empty short names apart', () => {
    const feature = (routeId: string, dir: number, irregular: boolean): GeoJsonFeature => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
      properties: {
        routeId, routeShortName: '', directionId: dir, day: 'Weekday',
        tier: irregular ? 'span' : '60', serviceClass: irregular ? 'irregular' : null, headway: irregular ? null : 60,
      },
    } as GeoJsonFeature);
    const regular = [feature('A', 0, false), feature('A', 1, false)];
    const oneWayIrregular = [feature('B', 0, false), feature('B', 1, true)];
    const all = [...regular, ...oneWayIrregular];
    stampRouteIrregularDirection(all);
    expect(regular.map(f => f.properties.routeHasIrregularDirection)).toEqual([undefined, undefined]);
    expect(oneWayIrregular.map(f => f.properties.routeHasIrregularDirection)).toEqual([true, true]);
  });
});
