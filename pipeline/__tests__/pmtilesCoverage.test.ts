import { describe, expect, it } from 'vitest';
import { isBuiltIntoTiles, isScheduleOnlyRouteArtifact, lonLatToTile, mustAppearInTiles, tilesForAgency } from '../pmtilesCoverage.js';

describe('PMTiles coverage sampling', () => {
  it('always samples the center tile for agencies without a bbox', () => {
    const agency = { center: [47, -120.55] as [number, number] };
    const center = lonLatToTile(-120.55, 47, 12);

    expect(tilesForAgency(agency, 12)).toContainEqual(center);
  });

  it('deduplicates the center tile when it is already in the bbox', () => {
    const agency = {
      center: [45.5, -73.5] as [number, number],
      bbox: [45.4, -73.6, 45.6, -73.4] as [number, number, number, number],
    };
    const tiles = tilesForAgency(agency, 12);
    const center = lonLatToTile(-73.5, 45.5, 12);

    expect(tiles.filter(tile => tile.x === center.x && tile.y === center.y)).toHaveLength(1);
  });
});

describe('isScheduleOnlyRouteArtifact', () => {
  const route = (type: string) => ({ geometry: { type }, properties: { routeId: 'r1' } });
  const stop = { geometry: { type: 'Point' }, properties: { stopId: 's1' } };

  it('treats an agency whose routes are all mapless Points as schedule-only', () => {
    expect(isScheduleOnlyRouteArtifact({ features: [route('Point'), route('Point'), stop] })).toBe(true);
  });

  it('keeps failing agencies that have any drawn line, or no readable artifact', () => {
    expect(isScheduleOnlyRouteArtifact({ features: [route('LineString'), route('Point')] })).toBe(false);
    expect(isScheduleOnlyRouteArtifact({ features: [stop] })).toBe(false);
    expect(isScheduleOnlyRouteArtifact(null)).toBe(false);
  });
});

describe('tile inclusion', () => {
  const live = { lastFeedExpiry: '20261128' };

  it('expects production-visible agencies with a feed expiry in the tiles', () => {
    expect(isBuiltIntoTiles(live)).toBe(true);
    expect(mustAppearInTiles(live)).toBe(true);
  });

  it('treats a hidden agency as expected-missing even without pmtilesPending (sun-tran, #615)', () => {
    const hidden = { ...live, hiddenInProduction: true };
    expect(isBuiltIntoTiles(hidden)).toBe(false);
    expect(mustAppearInTiles(hidden)).toBe(false);
  });

  it('leaves staged and pending agencies out of the tiles and the gate', () => {
    for (const agency of [{ ...live, staged: true }, { ...live, pmtilesPending: true }]) {
      expect(isBuiltIntoTiles(agency)).toBe(false);
      expect(mustAppearInTiles(agency)).toBe(false);
    }
  });

  it('builds a refreshed agency with no feed expiry but does not gate on it', () => {
    const noExpiry = { lastRefreshedAt: '2026-10-01' };
    expect(isBuiltIntoTiles(noExpiry)).toBe(true);
    expect(mustAppearInTiles(noExpiry)).toBe(false);
  });
});
