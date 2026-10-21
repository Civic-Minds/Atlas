import { describe, expect, it } from 'vitest';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import { rowLabelWithOrigin, rowsShareOrigin } from '../rowOriginLabel';

const row = (headsign: string, firstStop: string, routeVariant: string | null = null) =>
  ({ headsign, routeVariant, stopOrder: [firstStop, 'x', 'y'] }) as unknown as ShapeProperties;
const labels = (rows: ShapeProperties[], base: (r: ShapeProperties) => string) =>
  rows.map(r => rowLabelWithOrigin(base(r), r, rows));
const toLabel = (r: ShapeProperties) => `to ${r.headsign}`;

describe('direction row origins', () => {
  // TTC 51 Leslie, published data (2026-10-20).
  it('TTC 51 Southbound: two origins to one destination read "from A to B via C"', () => {
    const southbound = [
      row('Donlands via Laird', '1984', 'from The Donway East at Lawrence Ave East'),
      row('Donlands via Laird', '14620', 'from Leslie Station'),
    ];
    expect(labels(southbound, toLabel)).toEqual([
      'from The Donway East at Lawrence Ave East to Donlands via Laird',
      'from Leslie Station to Donlands via Laird',
    ]);
  });

  it('TTC 51 Northbound: both rows start at Leslie Station\'s stop, so no "from"', () => {
    const northbound = [row('Leslie Station via Laird', '14649'), row('Don Mills via Laird', '14649')];
    expect(rowsShareOrigin(northbound)).toBe(true);
    expect(labels(northbound, toLabel)).toEqual(['to Leslie Station via Laird', 'to Don Mills via Laird']);
  });

  it('a single-row direction never names its origin', () => {
    const only = [row('Kipling', '1', 'from Union')];
    expect(labels(only, toLabel)).toEqual(['to Kipling']);
  });

  it('three rows, two sharing an origin: every row that names an origin says "from"', () => {
    const rows = [
      row('Donlands', 'A', 'from Leslie Station'),
      row('Danforth', 'A', 'from Leslie Station'),
      row('Donlands', 'B', 'from The Donway East'),
    ];
    expect(labels(rows, toLabel)).toEqual([
      'from Leslie Station to Donlands',
      'from Leslie Station to Danforth',
      'from The Donway East to Donlands',
    ]);
  });

  it('rows sharing a first stop drop a "from" variant', () => {
    const rows = [row('Donlands', 'A', 'from Leslie Station'), row('Donlands', 'A', 'from Leslie Station Bay 2')];
    expect(labels(rows, toLabel)).toEqual(['to Donlands', 'to Donlands']);
  });

  it('a row without a named origin keeps its plain label', () => {
    const rows = [row('Donlands', 'A', 'from Leslie Station'), row('Eglinton', 'B')];
    expect(labels(rows, toLabel)).toEqual(['from Leslie Station to Donlands', 'to Eglinton']);
  });

  it('other variants keep the earlier "variant · label" form for a shared destination', () => {
    const rows = [row('Downtown', 'A', 'Express'), row('Downtown', 'B')];
    expect(labels(rows, toLabel)).toEqual(['Express · to Downtown', 'to Downtown']);
    expect(labels([row('Downtown', 'A', 'Express'), row('Airport', 'B')], toLabel)).toEqual(['to Downtown', 'to Airport']);
  });
});
