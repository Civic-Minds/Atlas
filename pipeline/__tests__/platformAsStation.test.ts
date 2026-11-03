/** CIV-226: a drawn child platform reads as its station, unless another pattern of the route stops there. */
import { describe, expect, it } from 'vitest';
import { platformsAsStation, remapWith } from '../platformAsStation.js';

const parents = new Map([['S07-T1', 'S07'], ['S07-T2', 'S07'], ['X-T1', 'X']]);
const t1 = [600, 620, 640], t2 = [610, 630, 650];
const station = [...t1, ...t2];

describe('platformsAsStation', () => {
  it('two platforms that split one pattern\'s trips both read the station\'s list (Sound Transit Link)', () => {
    const own = new Map([['S07-T1', t1], ['S07-T2', t2], ['S07', station], ['N01', [700]]]);
    const group = new Map([['S07', [...station]], ['S07-T1', t1], ['S07-T2', t2], ['N01', [700]]]);
    const r = platformsAsStation(own, group, parents);
    expect(r.map.get('S07-T1')).toBe(station);
    expect(r.map.get('S07-T2')).toBe(station);
    expect(r.map.get('N01')).toEqual([700]);
    expect([...r.remapped]).toEqual([['S07-T1', 'S07'], ['S07-T2', 'S07']]);
    expect(own.get('S07-T1')).toBe(t1); // the input map is untouched
  });

  it('legitimate: another pattern of the route stops at the station, so the platform keeps its own list (Brampton 50/50A, MBTA Beverly)', () => {
    const own = new Map([['S07-T1', t1], ['S07', t1]]);
    const group = new Map([['S07', [...t1, ...t2]], ['S07-T1', t1], ['S07-T2', t2]]);
    const r = platformsAsStation(own, group, parents);
    expect(r.map).toBe(own);
    expect(r.remapped.size).toBe(0);
  });

  it('legitimate: a platform whose station the row does not list, or a stop with no parent, is left alone', () => {
    const own = new Map([['S07-T1', t1], ['N01', [700]]]);
    expect(platformsAsStation(own, new Map(own), parents).map).toBe(own);
    const noParent = new Map([['N01', [700]], ['N02', [710]]]);
    expect(platformsAsStation(noParent, new Map(noParent), parents).map).toBe(noParent);
  });

  it('a row that reads the whole direction (the group map itself) remaps too: the station list is its own', () => {
    const group = new Map([['S07-T1', t1], ['S07-T2', t2], ['S07', station]]);
    const r = platformsAsStation(group, group, parents);
    expect(r.map.get('S07-T1')).toBe(station);
  });

  it('legitimate: a platform the row does not draw (no value of its own, or arrival-only) is left alone', () => {
    const own = new Map([['S07-T1', t1], ['S07-T2', t2], ['S07', station]]);
    const r = platformsAsStation(own, new Map(own), parents, stopId => stopId === 'S07-T1');
    expect(r.map.get('S07-T1')).toBe(station);
    expect(r.map.get('S07-T2')).toBe(t2);
    expect([...r.remapped.keys()]).toEqual(['S07-T1']);
  });

  it('legitimate: a loop that passes the terminal twice keeps the second bay\'s own times (Brampton 32 at Trinity Common)', () => {
    // The station counts each trip's first visit (bay A); bay B's later times are not in its list.
    const bayA = [600, 660], bayB = [616, 676], stationFirst = [600, 660];
    const own = new Map([['A', bayA], ['B', bayB], ['ST', stationFirst]]);
    const r = platformsAsStation(own, new Map(own), new Map([['A', 'ST'], ['B', 'ST']]));
    expect(r.map.get('A')).toBe(stationFirst);
    expect(r.map.get('B')).toBe(bayB);
  });

  it('legitimate: platforms served by different patterns of one row keep their own lists (Canton Junction: Providence trains at Track 2, Stoughton at Track 6)', () => {
    const track2 = [600, 660], track6 = [630, 690], station = [600, 630, 660, 690];
    const own = new Map([['T2', track2], ['T6', track6], ['CJ', station]]);
    const parents = new Map([['T2', 'CJ'], ['T6', 'CJ']]);
    const patterns = new Map([['T2', new Set(['providence'])], ['T6', new Set(['stoughton'])], ['CJ', new Set(['providence', 'stoughton'])]]);
    const r = platformsAsStation(own, new Map(own), parents, () => true, id => patterns.get(id));
    expect(r.remapped.size).toBe(0);
    // The same station with both platforms used by one pattern (Sound Transit) remaps.
    const same = new Map([['T2', new Set(['link'])], ['T6', new Set(['link'])]]);
    expect(platformsAsStation(own, new Map(own), parents, () => true, id => same.get(id)).remapped.size).toBe(2);
  });

  it('remapWith applies the same platforms to a twin map', () => {
    const twin = new Map([['S07-T1', [601]], ['S07-T2', [611]], ['S07', [601, 611]]]);
    const out = remapWith(twin, new Map([['S07-T1', 'S07'], ['S07-T2', 'S07']]));
    expect(out.get('S07-T1')).toEqual([601, 611]);
    expect(out.get('S07-T2')).toEqual([601, 611]);
    expect(remapWith(twin, new Map())).toBe(twin);
  });
});
