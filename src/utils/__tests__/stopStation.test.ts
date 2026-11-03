import { describe, expect, it } from 'vitest';
import { sameStationStopIds, stationNameOf, stopCardSiblings } from '../stopStation';

const same = (clicked: Parameters<typeof sameStationStopIds>[0], siblings: Parameters<typeof sameStationStopIds>[1]) =>
  [...sameStationStopIds(clicked, siblings)].sort();

describe('stationNameOf (CIV-1305)', () => {
  it('reads the station a stop name starts with', () => {
    expect(stationNameOf('Kipling Terminal Platform 3')).toBe('kipling terminal');
    expect(stationNameOf('U District Station Bay 2')).toBe('u district station');
    expect(stationNameOf('Salesforce Transit Center Bay 6')).toBe('salesforce transit center');
    expect(stationNameOf('BERNARD TERMINAL PLATFORM 4')).toBe('bernard terminal');
    expect(stationNameOf('Ajax GO Bus')).toBe('ajax go');
    expect(stationNameOf('Bingham Loop')).toBe('bingham loop');
  });

  it('gives no station for a street stop, even one named after a nearby station', () => {
    expect(stationNameOf('Kingston Rd at Pine Ridge Dr')).toBeNull();
    expect(stationNameOf('Bay St at Bloor St West - Bay Station')).toBeNull();
    expect(stationNameOf('Kingston Rd at Celeste Dr East Side - Guildwood GO Station')).toBeNull();
    expect(stationNameOf('Eglinton Ave East at Kennedy Station')).toBeNull();
    expect(stationNameOf('BUR OAK AV / MOUNT JOY GO STATION')).toBeNull();
    expect(stationNameOf('Bayly Eastbound @ Pickering Station')).toBeNull();
    expect(stationNameOf('Station Rd')).toBeNull();
  });

  it('gives no station where the station word names a road, or the stop is near, opposite or off a station', () => {
    // MiWay 3039 and 3046 are street stops on Erindale Station Rd, 52 m apart, one each way.
    expect(stationNameOf('Erindale Station Rd South Of Burnhamthorpe Rd')).toBeNull();
    expect(stationNameOf('Erindale Station Rd North Of Central Pky')).toBeNull();
    expect(stationNameOf('Central Pky West Of Erindale Station Rd')).toBeNull();
    expect(stationNameOf('Main St Near Union Station')).toBeNull();
    expect(stationNameOf('Dundas St Opp Kipling Station')).toBeNull();
    expect(stationNameOf('Kennedy Station - Platform A')).toBe('kennedy station');
  });
});

describe('sameStationStopIds (CIV-1305)', () => {
  it('a street stop keeps only itself: the stop across the road is not its station (TTC 4220, #1092)', () => {
    expect(same({ stopId: '4220', stopName: 'Kingston Rd at Pine Ridge Dr' }, [
      { stopId: '4253', stopName: 'Kingston Rd at Pine Ridge Dr' },
      { stopId: '4241', stopName: 'Kingston Rd at Pine Ridge Dr North Side' },
    ])).toEqual(['4220']);
  });

  it("keeps a terminal's platforms together by name where the feed has no parent stations", () => {
    expect(same({ stopId: '9056', stopName: 'Kipling Terminal Platform 3' }, [
      { stopId: '9099', stopName: 'Kipling Terminal Platform 12' },
      { stopId: '1', stopName: 'Dundas St West at Kipling Ave' },
    ])).toEqual(['9056', '9099']);
  });

  it('keeps platforms with different names together by their parent station (OC Transpo MACKENZIE KING A/B)', () => {
    // The real feed: parent 3000_stn is named just "MACKENZIE KING"; its platforms are 9449 (A) and 3585 (B).
    const parent = { parentStation: '3000_stn', parentStationName: 'MACKENZIE KING' };
    expect(same({ stopId: '9449', stopName: 'MACKENZIE KING A', ...parent }, [
      { stopId: '3585', stopName: 'MACKENZIE KING B', ...parent },
      { stopId: '9', stopName: 'RIDEAU / SUSSEX' },
    ])).toEqual(['3585', '9449']);
    // Before the rebuild publishes parents, the two platforms split: no station word to match by name.
    expect(same({ stopId: '9449', stopName: 'MACKENZIE KING A' }, [{ stopId: '3585', stopName: 'MACKENZIE KING B' }])).toEqual(['9449']);
  });

  it('reads parent names the way the feeds write them: STM in capitals with the station word first, TTC short with none', () => {
    // STM: "STATION ANGRIGNON", any case, station word anywhere.
    const stm = { parentStation: 'ANG', parentStationName: 'STATION ANGRIGNON' };
    expect(same({ stopId: '1', stopName: 'Angrignon', ...stm }, [{ stopId: '2', stopName: 'Angrignon - Terminus', ...stm }])).toEqual(['1', '2']);
    // A street-corner child still counts when its parent names a station.
    expect(same({ stopId: '3', stopName: 'Lamont / Bannantyne', ...stm }, [{ stopId: '4', stopName: 'Angrignon', ...stm }])).toEqual(['3', '4']);
    // TTC: parent "Union", no station word. Its platforms aren't street corners, so the parent counts.
    const ttc = { parentStation: '15772', parentStationName: 'Union' };
    expect(same({ stopId: '13815', stopName: 'Union Station - Northbound Platform', ...ttc }, [
      { stopId: '13816', stopName: 'Union Station - Southbound Platform', ...ttc },
      { stopId: '10935', stopName: 'Union Station - Streetcar Platform', ...ttc },
    ])).toEqual(['10935', '13815', '13816']);
  });

  it("ignores a parent that isn't a station (MiWay's street-corner place_ parents)", () => {
    const corner = { parentStation: 'place_cormav', parentStationName: 'Mavis Rd At Courtneypark Dr' };
    expect(same({ stopId: '1', stopName: 'Mavis Rd At Courtneypark Dr', ...corner }, [
      { stopId: '2', stopName: 'Mavis Rd At Sombrero Way', ...corner },
    ])).toEqual(['1']);
  });

  it('a street stop named after a station splits from the station itself (TTC Bay)', () => {
    expect(same({ stopId: '1', stopName: 'Bay Station - Eastbound Platform' }, [
      { stopId: '2', stopName: 'Bay St at Bloor St West - Bay Station' },
      { stopId: '3', stopName: 'Bay Station - Westbound Platform' },
    ])).toEqual(['1', '3']);
  });
});

describe('the decision-page stops and stations (CIV-1305)', () => {
  const ids = (clicked: Parameters<typeof sameStationStopIds>[0], siblings: Parameters<typeof sameStationStopIds>[1]) =>
    [...sameStationStopIds(clicked, siblings)].sort();

  it('street pairs split: DRT Kingston WB @ Chapman, TTC Davisville at Cleveland, TriMet A Ave & Chandler, MiWay Erindale Station Rd', () => {
    expect(ids({ stopId: '1596', stopName: 'Kingston Westbound @ Chapman' }, [{ stopId: '2238', stopName: 'Kingston Eastbound @ Ritchie' }])).toEqual(['1596']);
    // Same name on both sides of the road: still two stops.
    expect(ids({ stopId: '1871', stopName: 'Davisville Ave at Cleveland St' }, [{ stopId: '1872', stopName: 'Davisville Ave at Cleveland St' }])).toEqual(['1871']);
    expect(ids({ stopId: '2', stopName: 'A Ave & Chandler' }, [{ stopId: '4', stopName: 'A Ave & 10th St' }])).toEqual(['2']);
    expect(ids({ stopId: '3039', stopName: 'Erindale Station Rd South Of Burnhamthorpe Rd' }, [{ stopId: '3046', stopName: 'Erindale Station Rd North Of Central Pky' }])).toEqual(['3039']);
  });

  it('TTC Kennedy stays one station: bus platforms, the subway platform and the drop-off platform', () => {
    expect(ids({ stopId: '14708', stopName: 'Kennedy Station - Platform A' }, [
      { stopId: '14709', stopName: 'Kennedy Station - Platform A' },
      { stopId: '14947', stopName: 'Kennedy Station - Subway Platform' },
      { stopId: '16453', stopName: 'Kennedy Station Drop-off Platform' },
      { stopId: '16392', stopName: 'Kennedy Station - Platform B' },
      { stopId: '3539', stopName: 'Eglinton Ave East at Kennedy Station' },
    ])).toEqual(['14708', '14709', '14947', '16392', '16453']);
  });
});

describe('stopCardSiblings (CIV-1305)', () => {
  const hubIds = { ttc: new Set(['14708', '14947', '3539']), go: new Set(['KE']) };
  const hubRoutes = { ttc: new Set(['2', '43', '54']), go: new Set(['ST']) };
  const own = [
    { stopId: '14708', stopName: 'Kennedy Station - Platform A', routeIds: ['43'] },
    { stopId: '14947', stopName: 'Kennedy Station - Subway Platform', routeIds: ['2'] },
    { stopId: '3539', stopName: 'Eglinton Ave East at Kennedy Station', routeIds: ['54'] },
  ];

  it("narrows only the clicked agency to its station; another agency at the station keeps the hub's stops (GO at Kennedy)", () => {
    const card = stopCardSiblings('ttc', own[0], own, hubIds, hubRoutes);
    expect([...card.siblingIdsByAgency.ttc].sort()).toEqual(['14708', '14947']);
    expect([...card.routesByAgency.ttc].sort()).toEqual(['2', '43']);
    expect(card.siblingIdsByAgency.go).toBe(hubIds.go);
    expect(card.routesByAgency.go).toBe(hubRoutes.go);
  });

  it("a street stop keeps only its own routes, even when the hub didn't list the clicked stop itself", () => {
    const clicked = { stopId: '4220', stopName: 'Kingston Rd at Pine Ridge Dr', routeIds: ['102', '12'] };
    const card = stopCardSiblings('ttc', clicked, [{ stopId: '4253', stopName: 'Kingston Rd at Pine Ridge Dr', routeIds: ['102', '86'] }],
      { ttc: new Set(['4253']) }, { ttc: new Set(['102', '12', '86']) });
    expect([...card.siblingIdsByAgency.ttc]).toEqual(['4220']);
    expect([...card.routesByAgency.ttc].sort()).toEqual(['102', '12']);
  });
});
