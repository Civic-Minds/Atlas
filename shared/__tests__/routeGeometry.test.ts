import { describe, expect, it } from 'vitest';
import { boundingBox, isDrawableLineCoordinates, lineCoordinates, lineStringCoordinatesOrNull, pointCoordinate } from '../routeGeometry';

const point = { type: 'Point', coordinates: [-79.38, 43.65] };
const line = { type: 'LineString', coordinates: [[-79.38, 43.65], [-79.37, 43.66]] };

describe('routeGeometry', () => {
  it('never treats a Point route as a list of coordinates', () => {
    expect(lineCoordinates(point)).toEqual([]);
    expect(lineStringCoordinatesOrNull(point)).toBeNull();
    expect(() => {
      for (const [lng, lat] of lineCoordinates(point)) void (lng + lat);
    }).not.toThrow();
  });

  it('returns line vertices for LineString and MultiLineString', () => {
    expect(lineCoordinates(line)).toEqual(line.coordinates);
    expect(lineCoordinates({ type: 'MultiLineString', coordinates: [line.coordinates, [[-79.36, 43.67]]] }))
      .toEqual([...line.coordinates, [-79.36, 43.67]]);
    expect(lineStringCoordinatesOrNull(line)).toEqual(line.coordinates);
  });

  it('handles missing or degenerate geometry', () => {
    expect(lineCoordinates(null)).toEqual([]);
    expect(lineCoordinates({ type: 'LineString' })).toEqual([]);
    expect(lineStringCoordinatesOrNull({ type: 'LineString', coordinates: [[-79.38, 43.65]] })).toBeNull();
  });

  it('reads a Point coordinate only from Points', () => {
    expect(pointCoordinate(point)).toEqual([-79.38, 43.65]);
    expect(pointCoordinate(line)).toBeNull();
  });

  it('rejects a bare [lon, lat] stored where a line was expected', () => {
    expect(isDrawableLineCoordinates([-79.38, 43.65])).toBe(false);
    expect(isDrawableLineCoordinates(undefined)).toBe(false);
    expect(isDrawableLineCoordinates(line.coordinates)).toBe(true);
  });
});

describe('boundingBox', () => {
  it('is null for no points', () => {
    expect(boundingBox([])).toBeNull();
  });

  it('is a zero-size box for one point', () => {
    expect(boundingBox([[-79.4, 43.6]])).toEqual({ minLng: -79.4, minLat: 43.6, maxLng: -79.4, maxLat: 43.6 });
  });

  it('spans every point', () => {
    expect(boundingBox([[-79.4, 43.6], [-79.2, 43.9], [-79.5, 43.7]])).toEqual({ minLng: -79.5, minLat: 43.6, maxLng: -79.2, maxLat: 43.9 });
  });
});
