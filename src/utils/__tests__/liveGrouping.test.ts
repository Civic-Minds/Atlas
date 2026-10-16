import { describe, expect, it } from 'vitest';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { DIRECTION_UNCLEAR, groupVehiclesByDirection, routeDirectionLabels } from '../liveGrouping';

const v = (id: string, extra: Partial<LiveVehicle> = {}): LiveVehicle => ({
  id, routeShortName: '501', displayName: '501', tripId: 't', lat: 43.65, lon: -79.4, bearing: null, speedKmh: null, tsEpoch: null,
  delayMin: null, headsign: null, directionId: null, vehicleLabel: null, status: 'no_data', agencySlug: 'ttc', ...extra,
});
const line = (directionId: number, headsign: string, lonSpan: number): GeoJSON.Feature => ({
  type: 'Feature', properties: { routeShortName: '501', directionId, headsign },
  geometry: { type: 'LineString', coordinates: [[-79.5, 43.6], [-79.5 + lonSpan, 43.6]] },
});

describe('routeDirectionLabels', () => {
  it('names each direction by its longest shape, never a short turn', () => {
    const labels = routeDirectionLabels([line(0, 'Neville Park', 0.2), line(0, 'Roncesvalles (short turn)', 0.05), line(1, 'Long Branch', 0.2)], '501');
    expect([labels.get(0), labels.get(1)]).toEqual(['Neville Park', 'Long Branch']);
  });
});

describe('groupVehiclesByDirection (every vehicle placed)', () => {
  const labels = new Map([[0, 'Neville Park'], [1, 'Long Branch']]);

  it('puts every vehicle in exactly one group, including ones with no direction', () => {
    const vehicles = [v('a', { directionId: 0 }), v('b', { directionId: 1 }), v('c', { headsign: 'Humber Loop' }), v('d'), v('e')];
    const groups = groupVehiclesByDirection(vehicles, labels);
    expect([...groups.values()].reduce((n, g) => n + g.length, 0)).toBe(vehicles.length);
    expect(groups.get('Neville Park')?.map(x => x.id)).toEqual(['a']);
    expect(groups.get('Humber Loop')?.map(x => x.id)).toEqual(['c']);
    expect(groups.get(DIRECTION_UNCLEAR)?.map(x => x.id)).toEqual(['d', 'e']);
  });

  it('falls back to Outbound / Inbound when a direction has no named shape', () => {
    const groups = groupVehiclesByDirection([v('a', { directionId: 0 }), v('b', { directionId: 1 })], new Map());
    expect([...groups.keys()]).toEqual(['Outbound', 'Inbound']);
  });
});
