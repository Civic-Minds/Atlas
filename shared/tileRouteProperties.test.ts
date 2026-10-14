import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TILE_ROUTE_FLAT_KEY, TILE_ROUTE_SCALAR_KEYS, pickTileRouteProperties } from './pmtilesProps';

const root = path.resolve(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const inTile = (key: string) => TILE_ROUTE_SCALAR_KEYS.includes(key) || TILE_ROUTE_FLAT_KEY.test(key);

/**
 * Route properties the client reads from a vector tile feature: through style expressions
 * (filters and paint) and through queryRenderedFeatures / querySourceFeatures. Losing one of these
 * from the route tiles would change what is drawn or what a click selects, so each is pinned here.
 * (Flat period keys such as hph_midday are matched by TILE_ROUTE_FLAT_KEY.)
 */
const CLIENT_READS_FROM_TILE_FEATURES = [
  // map click, export, In view list, History, route-tile availability check
  'agencySlug', 'routeId', 'routeBranch', 'routeShortName', 'routeLongName', 'routeType', 'agencyName',
  // style filters and paint
  'directionId', 'headsign', 'day', 'tier', 'serviceClass', 'headway', 'worstDirectionHeadway',
  'routeHasLimitedDirection', 'routeHasIrregularDirection',
  // flat period keys the headway filter reads
  'hph_midday', 'wdph_midday', 'msph_midday', 'pch_midday', 'wdpch_midday', 'hps_midday', 'pws_midday',
];

/** Property names in style expressions that belong to GeoJSON overlays built in the browser, or to the stops layer. */
const NOT_ROUTE_TILE_PROPERTIES = new Set([
  'selected', 'color', 'frequentServiceBand', 'localHeadwayColor', 'stopId', 'isRail', 'isHub', 'isHubRef',
  'hoursConfirmed', 'stopHeadways', 'name', 'hubId', 'onDemandZoneId', 'areaName',
]);

describe('route tile properties', () => {
  it('keeps every property the client reads from tile features', () => {
    for (const key of CLIENT_READS_FROM_TILE_FEATURES) expect(inTile(key), key).toBe(true);
  });

  it('keeps every literal property named in the tile style expressions', () => {
    const files = [
      'shared/tileFilterExprs.ts',
      'src/hooks/useIntervalStats.ts',
      'src/components/Interval/MapCanvas.tsx',
      'src/utils/frequencySegments.ts',
    ];
    const missing = new Set<string>();
    for (const file of files) {
      for (const m of read(file).matchAll(/\[\s*'(?:get|has)'\s*,\s*'([A-Za-z_][A-Za-z0-9_]*)'/g)) {
        const key = m[1];
        if (!NOT_ROUTE_TILE_PROPERTIES.has(key) && !inTile(key)) missing.add(`${file}: ${key}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('drops the nested tables that only the agency JSON reads, and keeps the flat period keys', () => {
    const picked = pickTileRouteProperties({
      routeId: '504', agencySlug: 'ttc', headway: 10, tier: '10',
      stopPeriodCoverageHeadways: { a: { midday: 10 } }, stopPeriodHeadways: {}, stopHeadways: {}, stopOrder: ['a'], stopPositions: [0],
      maxGapByHour: {}, headwayByHour: {}, headwayRangeByPeriod: {}, headwayByPeriod: { midday: 10 },
      shortTurnVariants: [], researchFrequentService: { daytime15: true }, routeDataQualityWarning: { code: 'x' },
      hph_midday: 10, wdph_midday: 10, pch_midday: 10, pws_midday: true,
    });
    expect(Object.keys(picked).sort()).toEqual(['agencySlug', 'headway', 'hph_midday', 'pch_midday', 'pws_midday', 'routeId', 'tier', 'wdph_midday']);
  });
});
