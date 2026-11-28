import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renameStops, type StopRename } from '../stop-renames';
import { renameHeadsigns, type HeadsignRename } from '../headsign-renames';
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

  // CIV-3095 (Ryan, 2026-11-26, picked 1: "hand-checked rename lists for the worst feeds only ... leave the rest"): each
  // full name is the agency's own, from its InfoPoint stop list (GoDurham, MVTA) or its earlier feed file (Norwalk), so
  // every entry only completes the cut-off name: it starts with the feed's name and is longer.
  it.each(['godurham', 'mvta', 'norwalktransit'])('%s list: one entry per stop, and each name only completes the cut-off one', slug => {
    const cfg = JSON.parse(readFileSync(new URL(`../../../config/agencies/${slug}.json`, import.meta.url), 'utf8')) as { stopRenames: StopRename[] };
    const ids = cfg.stopRenames.map(r => r.stopId);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of cfg.stopRenames) {
      expect(r.to.startsWith(r.from)).toBe(true);
      expect(r.to.length).toBeGreaterThan(r.from.length);
    }
  });
});

describe('hand-checked headsign renames (CIV-3124, #1908)', () => {
  const trips = (rows: Array<[string, string]>) => ({ trips: rows.map(([route_id, trip_headsign], i) => ({ route_id, trip_id: `t${i}`, service_id: 's', trip_headsign })) }) as unknown as GtfsData;
  const issaquah: HeadsignRename = { routeId: '100451', from: 'Issaquah Highlands Park & Ride Issaquah Transit Center', to: 'Issaquah Highlands Park & Ride' };

  it("renames the route's trips that give the listed headsign, and leaves other routes and headsigns alone", () => {
    const out = renameHeadsigns(trips([
      ['100451', 'Issaquah Highlands Park & Ride Issaquah Transit Center'],
      ['100451', 'Issaquah Highlands Park & Ride Issaquah Transit Center'],
      ['100451', 'Bellevue Transit Center South Bellevue Station'],
      ['102769', 'Issaquah Highlands Park & Ride Issaquah Transit Center'],
    ]), [issaquah]);
    expect(out.gtfs.trips.map(t => t.trip_headsign)).toEqual([
      'Issaquah Highlands Park & Ride',
      'Issaquah Highlands Park & Ride',
      'Bellevue Transit Center South Bellevue Station',
      'Issaquah Highlands Park & Ride Issaquah Transit Center',
    ]);
    expect(out.renamed).toBe(2);
    expect(out.stale).toEqual([]);
  });

  it('leaves trips as published once the feed no longer gives the listed headsign, and reports the entry as stale', () => {
    const out = renameHeadsigns(trips([['100451', 'Issaquah Highlands P&R']]), [issaquah]);
    expect(out.gtfs.trips[0].trip_headsign).toBe('Issaquah Highlands P&R');
    expect(out.stale).toEqual([issaquah]);
  });

  it("King County Metro's list: one entry per route and headsign, and each name changes", () => {
    const cfg = JSON.parse(readFileSync(new URL('../../../config/agencies/kingcountymetro.json', import.meta.url), 'utf8')) as { headsignRenames: HeadsignRename[] };
    const keys = cfg.headsignRenames.map(r => `${r.routeId}|${r.from}`);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of cfg.headsignRenames) expect(r.to).not.toBe(r.from);
  });
});
