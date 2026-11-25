#!/usr/bin/env npx tsx
/**
 * CIV-2897: a Live route's setup read from data, never typed by hand.
 *
 *   npx tsx scripts/live-route-setup.ts headways [--write]
 *     Each Live route's scheduled headway (scheduledHeadwayMin) for the agencies in HEADWAY_FROM_SCHEDULE: its midday
 *     typical wait as the published schedule gives it (route_frequency's waitMinutes, periodFigure), written to
 *     shared/data/live-scheduled-headways.json, which shared/livePollingConfig.ts reads.
 *   npx tsx scripts/live-route-setup.ts stops <gtfs.zip> <route short name> <YYYYMMDD>
 *     The route's target stops and their minutes from the start of the trip, per direction, from the feed's longest
 *     pattern that day: its first stop, the stop nearest the middle of the trip and its last stop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import Papa from 'papaparse';

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'headways') {
  const { getReleaseAgency } = await import('./build-agency-page-summaries');
  const { DEFAULT_R2_PUBLIC_URL } = await import('../shared/rules/paths');
  const { normalizeRouteFilterFeatures } = await import('../shared/routeHeadwayFilter');
  const { routeGroupKey } = await import('../shared/routeGroupKey');
  const { periodFigure } = await import('./mcp/atlasData');
  const { LIVE_POLLING_ROUTES, HEADWAY_FROM_SCHEDULE } = await import('../shared/livePollingConfig');
  const release = await (await fetch(`${DEFAULT_R2_PUBLIC_URL}/atlas/release.json?t=${Date.now()}`)).json();
  const out: Record<string, Record<string, number>> = {};
  for (const slug of HEADWAY_FROM_SCHEDULE) {
    const file = await getReleaseAgency(release, slug, null);
    const lines = file.features.filter((f: { properties?: Record<string, unknown> }) => f.properties?.routeId != null && f.properties.stopId == null);
    normalizeRouteFilterFeatures(lines);
    for (const cfg of LIVE_POLLING_ROUTES.filter(r => r.slug === slug && !r.vehiclesOnly)) {
      const key = routeGroupKey(cfg.displayRouteShortName, cfg.displayRouteShortName);
      const rows = lines.map((f: { properties: Record<string, unknown> }) => f.properties)
        .filter((p: Record<string, unknown>) => p.day === 'Weekday' && routeGroupKey(p.routeShortName, p.routeId) === key);
      const wait = rows.length ? periodFigure({ key, name: key, shortName: key, longName: null, mode: 'Bus', rows } as never, 'midday').waitMinutes : null;
      if (wait == null) { console.error(`${slug} ${key}: no midday figure in release ${release.releaseId}`); process.exitCode = 1; continue; }
      (out[slug] ??= {})[cfg.displayRouteShortName] = wait;
    }
  }
  const text = `${JSON.stringify({ releaseId: release.releaseId, period: 'midday', headways: out }, null, 2)}\n`;
  if (rest.includes('--write')) writeFileSync('shared/data/live-scheduled-headways.json', text);
  console.log(text);
} else if (mode === 'stops') {
  const [zipPath, short, ymd] = rest;
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const read = async (n: string) => Papa.parse<Record<string, string>>((await zip.file(n)!.async('string')).replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data;
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}T12:00:00`).getDay()];
  const active = new Set((await read('calendar.txt')).filter(c => c.start_date <= ymd && ymd <= c.end_date && c[dow] === '1').map(c => c.service_id));
  if (zip.file('calendar_dates.txt')) for (const c of await read('calendar_dates.txt')) if (c.date === ymd) (c.exception_type === '1' ? active.add(c.service_id) : active.delete(c.service_id));
  const routeIds = new Set((await read('routes.txt')).filter(r => r.route_short_name === short).map(r => r.route_id));
  const trips = new Map((await read('trips.txt')).filter(t => routeIds.has(t.route_id) && active.has(t.service_id)).map(t => [t.trip_id, t]));
  const names = new Map((await read('stops.txt')).map(s => [s.stop_id, s.stop_name]));
  const mins = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 60 + m + (s || 0) / 60; };
  const byTrip = new Map<string, Array<{ seq: number; stop: string; t: number }>>();
  for (const st of await read('stop_times.txt')) {
    if (!trips.has(st.trip_id)) continue;
    const t = st.departure_time || st.arrival_time; if (!t) continue;
    (byTrip.get(st.trip_id) ?? byTrip.set(st.trip_id, []).get(st.trip_id)!).push({ seq: Number(st.stop_sequence), stop: st.stop_id, t: mins(t) });
  }
  const result: Record<string, { routeIds: string[]; stops: Record<string, string>; offsets: Record<string, number> }> = {};
  for (const dir of ['0', '1']) {
    const list = [...byTrip.entries()].filter(([id]) => (trips.get(id)!.direction_id || '0') === dir).map(([, s]) => s.sort((a, b) => a.seq - b.seq));
    if (!list.length) continue;
    const longest = list.reduce((a, b) => (b.length > a.length ? b : a));
    const pattern = longest.map(s => s.stop).join('>');
    const same = list.filter(s => s.map(x => x.stop).join('>') === pattern);
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const at = (i: number) => Math.round(median(same.map(s => s[i].t - s[0].t)));
    const mid = longest.findIndex(s => s.t - longest[0].t >= (longest.at(-1)!.t - longest[0].t) / 2);
    const picks = [0, mid, longest.length - 1];
    result[dir] = {
      routeIds: [...routeIds],
      stops: Object.fromEntries(picks.map(i => [longest[i].stop, names.get(longest[i].stop) ?? longest[i].stop])),
      offsets: Object.fromEntries(picks.map(i => [longest[i].stop, at(i)])),
    };
  }
  console.log(JSON.stringify(result, null, 2));
} else {
  console.error('Usage: live-route-setup.ts headways [--write] | stops <gtfs.zip> <short name> <YYYYMMDD>');
  process.exit(1);
}
