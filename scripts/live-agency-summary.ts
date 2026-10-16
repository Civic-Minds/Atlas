/**
 * Build the Live agency dashboard file (CIV-262) from the route analysis files that exist.
 *
 *   npx tsx scripts/live-agency-summary.ts [agency=ttc]
 *
 * Reads ../_live-data/out/<agency>-<route>-segments.json for every route with Live analysis (shared/livePollingConfig
 * LIVE_ANALYSIS_ROUTES), leaves held routes out (LIVE_DASHBOARD_HOLD) and lists them, counts the agency's routes in its
 * timetable (gtfs/candidates/surface/routes.txt) and adds stop positions for the map. Writes
 * ../_live-data/out/<agency>-agency.json, which /api/live-agency serves. Light: it reads a few small files, no analysis.
 * Set LIVE_DATA to use another data folder.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { LIVE_ANALYSIS_ROUTES } from '../shared/livePollingConfig';
import { LIVE_DASHBOARD_HOLD, LIVE_DASHBOARD_UNCERTAIN_START, type LiveV3 } from '../shared/liveDashboard';
import { agencySummary, type AgencyRouteInput } from '../shared/liveAgency';
import { getRouteLabel, routeLabelParts } from '../shared/cleanHeadsign';
import { titleCase } from '../src/utils/format';

/** Quote-aware CSV (stop and route names hold commas). */
export function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '', row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows;
  const keys = head.map(k => k.replace(/^﻿/, '').trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function main() {
  const agency = process.argv[2] ?? 'ttc';
  const data = resolve(process.env.LIVE_DATA ?? '../_live-data');
  const gtfs = resolve(data, 'gtfs/candidates/surface');
  const out = resolve(data, 'out');
  const routesTxt = readCsv(readFileSync(resolve(gtfs, 'routes.txt'), 'utf8'));
  const byShort = new Map(routesTxt.map(r => [r.route_short_name || r.route_id, r]));
  const totalRoutes = byShort.size;

  const keys = LIVE_ANALYSIS_ROUTES.filter(k => k.startsWith(`${agency}::`)).map(k => k.slice(agency.length + 2));
  const held = Object.entries(LIVE_DASHBOARD_HOLD).filter(([k]) => k.startsWith(`${agency}::`)).map(([k]) => ({ route: k.slice(agency.length + 2) }));
  const routes: AgencyRouteInput[] = [];
  const missing: string[] = [];
  for (const route of keys) {
    if (held.some(h => h.route === route)) continue;
    const file = resolve(out, `${agency}-${route}-segments.json`);
    if (!existsSync(file)) { missing.push(route); continue; }
    const v3 = (JSON.parse(readFileSync(file, 'utf8')) as { v3?: LiveV3 }).v3;
    if (!v3 || v3.schema !== 3) { missing.push(route); continue; }
    const r = byShort.get(route);
    // The route card's title rule (until the one route-label helper, UI step 9, reaches this branch).
    const label = titleCase(getRouteLabel(route, r?.route_long_name || null));
    const parts = routeLabelParts(route, r?.route_long_name || null);
    const titleLabel = titleCase([parts.primary, parts.secondary].filter(Boolean).join(' '));
    routes.push({ route, label, titleLabel, mode: Number(r?.route_type ?? 3), longName: r?.route_long_name || null, v3, uncertainStart: LIVE_DASHBOARD_UNCERTAIN_START[`${agency}::${route}`] ?? [] });
  }
  const summary = agencySummary({ agency, totalRoutes, routes, held });

  // Stop positions for the map (only the stops the page shows).
  const wanted = new Set([...summary.worstStops.map(s => s.stopId), ...[...summary.delayStarts, ...summary.bunchingForms].flatMap(s => [s.fromStopId, s.toStopId])]);
  const pos = new Map<string, [number, number]>();
  for (const s of readCsv(readFileSync(resolve(gtfs, 'stops.txt'), 'utf8'))) {
    if (wanted.has(s.stop_id)) pos.set(s.stop_id, [Number(s.stop_lat), Number(s.stop_lon)]);
  }
  for (const s of summary.worstStops) { const p = pos.get(s.stopId); if (p) { s.lat = p[0]; s.lon = p[1]; } }
  for (const s of [...summary.delayStarts, ...summary.bunchingForms]) { s.from = pos.get(s.fromStopId); s.to = pos.get(s.toStopId); }

  const file = resolve(out, `${agency}-agency.json`);
  writeFileSync(file, JSON.stringify(summary));
  console.log(`live-agency-summary: ${summary.covered.length} of ${totalRoutes} ${agency} routes (${held.length} held${missing.length ? `, no analysis file: ${missing.join(', ')}` : ''}) -> ${file}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-agency-summary.ts')) main();
