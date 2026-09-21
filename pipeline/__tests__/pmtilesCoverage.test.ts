import { describe, expect, it } from 'vitest';
import { lonLatToTile, tilesForAgency } from '../pmtilesCoverage.js';

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
