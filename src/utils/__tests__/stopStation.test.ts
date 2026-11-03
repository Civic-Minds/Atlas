import { describe, expect, it } from 'vitest';
import { sameStationStopIds, stationNameOf } from '../stopStation';

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
