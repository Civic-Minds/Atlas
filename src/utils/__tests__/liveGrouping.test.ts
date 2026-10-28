import { describe, expect, it } from 'vitest';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import { DIRECTION_UNCLEAR, compareLiveRoutes, destinationKind, focusDirectionKey, groupVehiclesByDirection, orderDirectionGroups, routeDirectionLabels, vehicleDirectionKey } from '../liveGrouping';

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

describe('vehicleDirectionKey (the direction a vehicle card keeps emphasised)', () => {
  const labels = new Map([[0, 'Neville Park'], [1, 'Long Branch']]);

  it('names the same group the direction list puts the vehicle in', () => {
    const vehicles = [v('a', { directionId: 0 }), v('b', { directionId: 1, headsign: 'Humber Loop' }), v('c'), v('d', { directionId: 1 })];
    const groups = groupVehiclesByDirection(vehicles, labels);
    for (const vehicle of vehicles) {
      expect(groups.get(vehicleDirectionKey(vehicle, labels))).toContain(vehicle);
    }
    expect(vehicleDirectionKey(vehicles[2], labels)).toBe(DIRECTION_UNCLEAR);
  });
});

describe('focusDirectionKey (what a Live pick narrows the fade to)', () => {
  const labels = new Map([[0, 'Neville Park'], [1, 'Long Branch']]);

  it('uses the picked direction row first', () => {
    expect(focusDirectionKey('Long Branch', v('a', { directionId: 0 }), labels)).toBe('Long Branch');
  });

  it('otherwise uses the direction of the vehicle whose card is open (a dot click)', () => {
    expect(focusDirectionKey(null, v('a', { directionId: 0 }), labels)).toBe('Neville Park');
    expect(focusDirectionKey(null, v('b'), labels)).toBe(DIRECTION_UNCLEAR);
  });

  it('is the whole route with neither', () => {
    expect(focusDirectionKey(null, null, labels)).toBeNull();
  });
});

describe('orderDirectionGroups (fixed row order, CIV-899)', () => {
  const labels = new Map([[0, 'Neville Park'], [1, 'Long Branch']]);
  const order = (vehicles: LiveVehicle[]) => orderDirectionGroups(groupVehiclesByDirection(vehicles, labels), labels).map(([k]) => k);

  it('lists direction 0, then direction 1 (main destination before short turns), then the rest, with "Direction unclear" last', () => {
    const vehicles = [
      v('u'),
      v('s', { directionId: 1, headsign: 'Humber Loop' }),
      v('b', { directionId: 1 }),
      v('h', { headsign: 'Dundas West Station' }),
      v('d', { directionId: 0, headsign: 'Distillery' }),
      v('a', { directionId: 0 }),
    ];
    expect(order(vehicles)).toEqual(['Neville Park', 'Distillery', 'Long Branch', 'Humber Loop', 'Dundas West Station', DIRECTION_UNCLEAR]);
  });

  it('gives the same order whatever order the feed lists the vehicles in', () => {
    const vehicles = [v('u'), v('b', { directionId: 1 }), v('a', { directionId: 0 }), v('d', { directionId: 0, headsign: 'Distillery' })];
    const expected = order(vehicles);
    expect(order([...vehicles].reverse())).toEqual(expected);
    expect(order([vehicles[2], vehicles[0], vehicles[3], vehicles[1]])).toEqual(expected);
    expect(expected[expected.length - 1]).toBe(DIRECTION_UNCLEAR);
  });

  it('puts Outbound before Inbound when no shape names the directions', () => {
    const groups = groupVehiclesByDirection([v('b', { directionId: 1 }), v('a', { directionId: 0 })], new Map());
    expect(orderDirectionGroups(groups, new Map()).map(([k]) => k)).toEqual(['Outbound', 'Inbound']);
  });
});

describe('compareLiveRoutes (route list order)', () => {
  const r = (agencySlug: string, routeShortName: string) => ({ agencySlug, routeShortName });
  const order = (list: ReturnType<typeof r>[]) => [...list].sort(compareLiveRoutes).map(x => `${x.agencySlug} ${x.routeShortName}`);

  it('sorts by agency, then route number in natural order', () => {
    expect(order([r('ttc', '510'), r('ttc', '7'), r('miway', '1'), r('ttc', '10'), r('ttc', '506')]))
      .toEqual(['miway 1', 'ttc 7', 'ttc 10', 'ttc 506', 'ttc 510']);
  });

  it('puts lettered branches in a fixed order whatever order the feed lists them', () => {
    expect(order([r('ttc', '7B'), r('ttc', '7'), r('ttc', '7A')])).toEqual(['ttc 7', 'ttc 7A', 'ttc 7B']);
    expect(order([r('ttc', '7A'), r('ttc', '7B'), r('ttc', '7')])).toEqual(['ttc 7', 'ttc 7A', 'ttc 7B']);
  });

  it('keeps numbered routes ahead of named ones', () => {
    expect(order([r('sfmta', 'N'), r('sfmta', '38'), r('sfmta', 'F')])).toEqual(['sfmta 38', 'sfmta F', 'sfmta N']);
  });
});

describe('destinationKind (CIV-1043)', () => {
  // TTC 504 and 506 as the Live analysis has them.
  const p504 = {
    0: [{ kind: 'main', fromName: 'Distillery Loop', toName: 'Dundas St West at Bloor St West' }, { kind: 'branch', fromName: 'Broadview Station at Bay 7', toName: 'Dufferin St at Liberty St' }],
    1: [{ kind: 'main', fromName: 'Dundas West Station at Bay 4', toName: 'King St East at Sumach St' }, { kind: 'branch', fromName: 'Dufferin Gate Loop', toName: 'Broadview Ave at Wolfrey Ave' }],
  };
  const p506 = { 0: [{ kind: 'main', fromName: 'Main Street Station at Bay 7', toName: 'Howard Park Ave at Indian Rd' }], 1: [{ kind: 'main', fromName: 'High Park Loop', toName: 'Main St at Danforth Ave' }] };
  const stops506 = ['College St at Spadina Ave', 'Gerrard St East at Broadview Ave', 'Howard Park Ave at Indian Rd', 'High Park Loop'];
  it('calls a destination that names one of the route\'s stops a short turn on a route with no branch', () => {
    expect(destinationKind(p506, 'Spadina', stops506)).toBe('shortTurn');
    expect(destinationKind(p506, 'Broadview & Gerrard', stops506)).toBe('shortTurn');
  });
  it('never tags an end or a destination that isn\'t a stop on the route', () => {
    // "High Park" leads "High Park Loop", a main end (the other direction's, or this one's under another name).
    expect(destinationKind(p506, 'High Park', stops506)).toBeNull();
    expect(destinationKind(p506, 'Main Street', stops506)).toBeNull();
    expect(destinationKind(p506, 'Replacement Bus', stops506)).toBeNull();
    // Without the route's stop names nothing can be checked: no tag.
    expect(destinationKind(p506, 'Spadina')).toBeNull();
  });
  it('names a branch only on a clear match, and nothing when unsure', () => {
    expect(destinationKind(p504, 'Dufferin Gate')).toBe('branch');
    expect(destinationKind(p504, 'Broadview')).toBe('branch');
    // On a route with a branch, a destination that matches no end is unclear: no tag.
    expect(destinationKind(p504, 'Broadview & Queen')).toBeNull();
    // It matches a main end too: unclear.
    expect(destinationKind(p504, 'Distillery')).toBeNull();
    expect(destinationKind(null, 'Spadina')).toBeNull();
  });
});
