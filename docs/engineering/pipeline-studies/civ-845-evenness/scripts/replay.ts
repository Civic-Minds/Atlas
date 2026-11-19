import fs from 'fs';
import { pooledReadingInWindow, collapseBunched } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/stopPools.ts';
import { departuresInWindow, medianHeadwayInWindow, headwayToTier } from '/Users/ryan/Developer/Code/Platforms/Atlas/pipeline/headway-utils.ts';

function csv(file: string): Record<string,string>[] {
  const t = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l: string) => { const o: string[] = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const h = split(t[0]); return t.slice(1).map(l => { const v = split(l); const r: Record<string,string> = {}; h.forEach((k, i) => r[k] = v[i] ?? ''); return r; });
}
const tmin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export interface StopList { stopId: string; deps: number[]; patterns: Set<string>; }
export function load(dir: string, shortName: string, dirId: string, date: string, routeFilter?: (headsign: string) => boolean) {
  const routes = csv(`${dir}/routes.txt`).filter(r => r.route_short_name === shortName).map(r => r.route_id);
  const dow = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date(date + 'T12:00:00').getDay()];
  const ymd = date.replace(/-/g, '');
  const svc = new Set(csv(`${dir}/calendar.txt`).filter(c => c[dow] === '1' && c.start_date <= ymd && c.end_date >= ymd).map(c => c.service_id));
  const trips = csv(`${dir}/trips.txt`).filter(t => routes.includes(t.route_id) && svc.has(t.service_id) && t.direction_id === dirId && (!routeFilter || routeFilter(t.trip_headsign)));
  const ids = new Map(trips.map(t => [t.trip_id, t]));
  const st = new Map<string, {stop: string; dep: number; seq: number}[]>();
  for (const r of csv(`${dir}/stop_times.txt`)) { if (!ids.has(r.trip_id)) continue; if (r.pickup_type === '1') continue; const l = st.get(r.trip_id) ?? []; l.push({ stop: r.stop_id, dep: tmin(r.departure_time || r.arrival_time), seq: Number(r.stop_sequence) }); st.set(r.trip_id, l); }
  for (const l of st.values()) l.sort((a, b) => a.seq - b.seq);
  return { trips, st };
}

/** Reference stop order: merge trip sequences by average relative position. */
export function referenceOrder(st: Map<string, {stop: string}[]>): string[] {
  const pos = new Map<string, number[]>();
  for (const l of st.values()) l.forEach((x, i) => { const a = pos.get(x.stop) ?? []; a.push(i / Math.max(1, l.length - 1)); pos.set(x.stop, a); });
  // follow the longest trip as the spine, insert others by avg position
  const longest = [...st.values()].sort((a, b) => b.length - a.length)[0].map(x => x.stop);
  const seen = new Set(longest);
  const all = [...pos.keys()].filter(s => !seen.has(s));
  const out = [...longest];
  for (const s of all) { const p = pos.get(s)!.reduce((a, b) => a + b, 0) / pos.get(s)!.length; let i = 0; while (i < out.length && (pos.get(out[i])!.reduce((a, b) => a + b, 0) / pos.get(out[i])!.length) < p) i++; out.splice(i, 0, s); }
  return out;
}

export function stopLists(st: Map<string, {stop: string; dep: number}[]>, order: string[]): StopList[] {
  const sig = new Map<string, string>();
  for (const [id, l] of st) sig.set(id, l.map(x => x.stop).join('>'));
  const sigId = new Map<string, string>(); [...new Set(sig.values())].forEach((s, i) => sigId.set(s, 'P' + i));
  const by = new Map<string, StopList>(order.map(s => [s, { stopId: s, deps: [], patterns: new Set() }]));
  for (const [id, l] of st) for (const x of l) { const e = by.get(x.stop); if (!e) continue; e.deps.push(x.dep); e.patterns.add(sigId.get(sig.get(id)!)!); }
  for (const e of by.values()) e.deps.sort((a, b) => a - b);
  return order.map(s => by.get(s)!);
}

export interface Metrics { n: number; worst: number | null; avg: number | null; rider: number | null; median: number | null; pooled: number | null; pooledWorst: number | null; }
export function metrics(deps: number[], start: number, end: number, own?: number[]): Metrics {
  const L = collapseBunched(departuresInWindow(deps, start, end, true));
  const rd = pooledReadingInWindow(deps, start, end, 3, false, own);
  if (L.length < 3) return { n: L.length, worst: null, avg: null, rider: null, median: null, pooled: null, pooledWorst: null };
  const gaps = L.slice(1).map((t, i) => t - L[i]);
  const sum = gaps.reduce((a, b) => a + b, 0);
  return { n: L.length, worst: Math.max(...gaps), avg: sum / gaps.length, rider: gaps.reduce((a, g) => a + g * g, 0) / sum, median: medianHeadwayInWindow(deps, start, end, 3, true), pooled: rd.value, pooledWorst: rd.worstWait };
}
export const pubValue = (m: Metrics) => m.pooled ?? m.pooledWorst; // published: value, else worst wait (CIV-1072)
export const tierOf = (v: number | null) => v == null ? '-' : headwayToTier(Math.round(v));
