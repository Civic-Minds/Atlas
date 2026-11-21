import fs from 'fs';
import { computeStopSharers, buildPooledStopMap, pooledReadingInWindow, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { medianHeadwayInWindow, forCrossMidnightWindow, headwayToTier, departuresInWindow } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';

export function csv(file: string): Record<string,string>[] {
  const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l: string) => { const o: string[] = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const h = split(t[0]); return t.slice(1).map(l => { const v = split(l); const r: Record<string,string> = {}; h.forEach((k, i) => r[k] = v[i] ?? ''); return r; });
}
const tmin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export interface Pat { key: string; shape: string; headsigns: string[]; order: string[]; deps: Map<string, number[]>; ntrips: number; }
/** Real patterns of one route direction: per route_id+shape, stop order from longest trip, first visit, pickup filter. */
export function loadPatterns(dir: string, stopsDir: string, shortName: string, dirId: string, date: string) {
  const routes = csv(`${dir}/routes.txt`).filter(r => r.route_short_name === shortName).map(r => r.route_id);
  const dow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date + 'T12:00:00').getDay()];
  const ymd = date.replace(/-/g, '');
  const svc = new Set(csv(`${dir}/calendar.txt`).filter(c => c[dow] === '1' && c.start_date <= ymd && c.end_date >= ymd).map(c => c.service_id));
  const trips = csv(`${dir}/trips.txt`).filter(t => routes.includes(t.route_id) && svc.has(t.service_id) && t.direction_id === dirId);
  const byId = new Map(trips.map(t => [t.trip_id, t]));
  const st = new Map<string, {stop: string; dep: number; seq: number; pu: string}[]>();
  for (const r of csv(`${dir}/stop_times.txt`)) { if (!byId.has(r.trip_id)) continue; const l = st.get(r.trip_id) ?? []; l.push({ stop: r.stop_id, dep: tmin(r.departure_time || r.arrival_time), seq: Number(r.stop_sequence), pu: r.pickup_type }); st.set(r.trip_id, l); }
  const stops = new Map<string, {lat: number; lon: number}>(); const parent = new Map<string, string>();
  for (const s of csv(`${stopsDir}/stops.txt`)) { stops.set(s.stop_id, { lat: +s.stop_lat, lon: +s.stop_lon }); if (s.parent_station) parent.set(s.stop_id, s.parent_station); }
  const pats = new Map<string, Pat & { best: number }>();
  for (const t of trips) {
    const l = (st.get(t.trip_id) ?? []).sort((a, b) => a.seq - b.seq); if (l.length < 2) continue;
    const key = `${t.route_id}|sh|${t.shape_id}`; if (!t.shape_id) continue;
    let p = pats.get(key); if (!p) { p = { key, shape: t.shape_id, headsigns: [], order: [], deps: new Map(), ntrips: 0, best: 0 }; pats.set(key, p); }
    p.ntrips++; if (!p.headsigns.includes(t.trip_headsign)) p.headsigns.push(t.trip_headsign);
    const seen = new Set<string>(); const first = l.filter(x => seen.has(x.stop) ? false : (seen.add(x.stop), true));
    if (first.length > p.best) { p.best = first.length; p.order = first.map(x => x.stop); }
    const s2 = new Set<string>();
    for (const x of l) { if (s2.has(x.stop)) continue; s2.add(x.stop); if (x.pu === '1') continue; const a = p.deps.get(x.stop) ?? []; a.push(x.dep); p.deps.set(x.stop, a); }
  }
  return { pats: [...pats.values()], stops, parent, trips };
}

export interface Reading { stop: string; pooled: boolean; sharers: string[]; value: number | null; worst: number | null; own: number | null; pub: number | null; n: number; }
export function readAll(L: ReturnType<typeof loadPatterns>, start: number, end: number) {
  const sp = L.pats.map(p => ({ memberKey: p.key, routeId: p.key.split('|')[0], headsigns: [...p.headsigns].sort(), stopOrder: p.order }));
  const sharers = computeStopSharers(sp, L.stops, L.parent);
  const depsOf = new Map(L.pats.map(p => [p.key, p.deps]));
  const out = new Map<string, Reading[]>();
  for (const p of L.pats) {
    const pooled = buildPooledStopMap(p.deps, sharers.get(p.key), k => depsOf.get(k), L.parent, p.deps);
    const rs: Reading[] = [];
    for (const stop of p.order) {
      const own = [...(p.deps.get(stop) ?? [])].sort((a, b) => a - b);
      const times = [...(pooled.map.get(stop) ?? own)].sort((a, b) => a - b);
      const isP = pooled.pooledStops.has(stop);
      const rd = isP ? pooledReadingInWindow(times, start, end, 3, false, own) : { value: null, worstWait: null };
      const ownV = medianHeadwayInWindow(forCrossMidnightWindow([...own], end), start, end, 3, true);
      const plain = isP ? rd.value : ownV;
      const pub = plain ?? ownV ?? rd.worstWait; // real: pooled ?? own period median ?? worst wait
      const sh = [...(sharers.get(p.key)?.get(L.parent.get(stop) ?? stop) ?? [])];
      rs.push({ stop, pooled: isP, sharers: sh, value: rd.value, worst: rd.worstWait, own: ownV, pub, n: times.length });
    }
    out.set(p.key, rs);
  }
  return { out, sharers };
}
