import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renameStops, type StopRename } from '../stop-renames';
import type { GtfsData } from '../../../types/gtfs';

const gtfs = (stops: Array<[string, string]>) => ({ stops: stops.map(([stop_id, stop_name]) => ({ stop_id, stop_name, stop_lat: 43.7, stop_lon: -79.4 })) }) as unknown as GtfsData;

describe('hand-checked stop renames (CIV-3021, #1855)', () => {
  it('renames a cut-off TTC name and a renamed station, and leaves other stops alone', () => {
    const renames: StopRename[] = [
      { stopId: '317', from: 'Bayview Ave at Sheppard Ave East North Side - Bayview Statio', to: 'Bayview Ave at Sheppard Ave East North Side - Bayview Station' },
      { stopId: '2136', from: 'Dundas St East at Yonge St - Dundas Station', to: 'Dundas St East at Yonge St - TMU Station' },
    ];
    const out = renameStops(gtfs([
      ['317', 'Bayview Ave at Sheppard Ave East North Side - Bayview Statio'],
      ['2136', 'Dundas St East at Yonge St - Dundas Station'],
      ['7152', 'Sheppard Ave East at Bayview Ave East Side - Bayview Station'],
    ]), renames);
    expect(out.gtfs.stops.map(s => s.stop_name)).toEqual([
      'Bayview Ave at Sheppard Ave East North Side - Bayview Station',
      'Dundas St East at Yonge St - TMU Station',
      'Sheppard Ave East at Bayview Ave East Side - Bayview Station',
    ]);
    expect(out.renamed).toBe(2);
    expect(out.stale).toEqual([]);
  });

  it('leaves a stop as published once the feed no longer gives the listed name, and reports the entry as stale', () => {
    const renames: StopRename[] = [{ stopId: '2136', from: 'Dundas St East at Yonge St - Dundas Station', to: 'Dundas St East at Yonge St - TMU Station' }];
    const out = renameStops(gtfs([['2136', 'Dundas St East at Yonge St - TMU Station Stop']]), renames);
    expect(out.gtfs.stops[0].stop_name).toBe('Dundas St East at Yonge St - TMU Station Stop');
    expect(out.renamed).toBe(0);
    expect(out.stale.map(r => r.stopId)).toEqual(['2136']);
  });

  it('TTC\'s list: one entry per stop, every name changes, and a name cut at 60 characters gets longer', () => {
    const ttc = JSON.parse(readFileSync(new URL('../../../config/agencies/ttc.json', import.meta.url), 'utf8')) as { stopRenames: StopRename[] };
    const ids = ttc.stopRenames.map(r => r.stopId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of ttc.stopRenames) {
      expect(r.to).not.toBe(r.from);
      if (r.from.length === 60) expect(r.to.length).toBeGreaterThan(60);
    }
  });
});
