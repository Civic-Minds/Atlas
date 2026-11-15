/**
 * A short, readable summary of a Live report refresh (CIV-1407), for review before the files are published: the weeks
 * covered, the days with good recordings in each, how well each day's positions matched its timetable, and each
 * route's headline numbers for this week and last.
 *
 * It also puts the new numbers beside the ones published now, lists the days left out for poor recordings, how many
 * runs each route matched to the timetable, and the snapshots the fetch could not read.
 *
 *   npx tsx scripts/live-refresh-summary.ts --files <dir of built files> [--match <report.json>] [--fetch <report.json>]
 *                                           [--published <dir of the files published now>] [--out <summary.md>]
 *
 * Reads only local files: the set scripts/live-publish.ts wrote, the reports of scripts/live-gtfs-for-window.ts and
 * scripts/live-fetch-archive.ts, and a downloaded copy of the published set.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WeekMetrics } from '../shared/liveDashboard';
import type { FetchDayReport } from './live-fetch-archive';
import type { WindowDayMatch } from './live-gtfs-for-window';
import type { ReportManifest } from './live-publish-upload';

type Weekly = { thisWeek: WeekMetrics; lastWeek: WeekMetrics; comparable?: boolean; health?: Array<{ date: string; snapshots: number; healthy: boolean }> } | null | undefined;
/** How a route's vehicle runs met the timetable (the route file's v3.totals, v3.swaps and v3.leftOut). */
export interface RunCounts { runs: number; reassigned: number; dropped: number; noTimetableTrip: number; kept: number }
export interface SummaryRoute { route: string; status: string; weekly: Weekly; runs?: RunCounts | null }
export interface FetchReport { maxFailedShare: number; days: FetchDayReport[]; ok: boolean }
/** The set that is published now: its manifest, network weeks and routes, read the same way as the new set. */
export interface PublishedSet { manifest: ReportManifest; network: Weekly; routes: readonly SummaryRoute[] }
export interface SummaryExtras { fetch?: FetchReport | null; published?: PublishedSet | null }
export interface MatchReport { from: string; to: string; minShare: number; feeds: Array<{ key: string; start: string; end: string }>; days: WindowDayMatch[]; ok: boolean }

const pct = (x: number | null | undefined) => (x == null ? '–' : `${(x * 100).toFixed(1)}%`);
const num = (x: number | null | undefined, unit = '') => (x == null ? '–' : `${Math.round(x * 10) / 10}${unit}`);
const span = (w: WeekMetrics | undefined) => (w?.dates.length ? `${w.dates[0]} to ${w.dates.at(-1)}` : 'none');
const goodDays = (w: WeekMetrics | undefined) => (w ? `${w.healthyDates.length} of ${w.dates.length}` : '–');

/** One week's headline cells: late share (and its sample), typical trip time over the timetable, extra wait, uneven gaps, service delivered. */
function cells(w: WeekMetrics | undefined): string[] {
  if (!w) return ['–', '–', '–', '–', '–'];
  return [
    w.late ? `${pct(w.late.share)} (${w.late.n})` : '–',
    num(w.tripTime?.overMin, ' min'),
    num(w.extraWait?.minutes, ' min'),
    pct(w.bunching?.share),
    pct(w.delivered?.share),
  ];
}

const points = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? '' : ` (${b - a >= 0 ? '+' : ''}${((b - a) * 100).toFixed(1)} pts)`);
const minutes = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? '' : ` (${b - a >= 0 ? '+' : ''}${(Math.round((b - a) * 10) / 10)} min)`);

/** One row of published -> new for this week's headline numbers, each with the size of the change. */
function changeCells(was: WeekMetrics | undefined, now: WeekMetrics | undefined): string[] {
  return [
    `${pct(was?.late?.share)} -> ${pct(now?.late?.share)}${points(was?.late?.share, now?.late?.share)}`,
    `${num(was?.tripTime?.overMin)} -> ${num(now?.tripTime?.overMin)}${minutes(was?.tripTime?.overMin, now?.tripTime?.overMin)}`,
    `${num(was?.extraWait?.minutes)} -> ${num(now?.extraWait?.minutes)}${minutes(was?.extraWait?.minutes, now?.extraWait?.minutes)}`,
    `${pct(was?.bunching?.share)} -> ${pct(now?.bunching?.share)}${points(was?.bunching?.share, now?.bunching?.share)}`,
    `${pct(was?.delivered?.share)} -> ${pct(now?.delivered?.share)}${points(was?.delivered?.share, now?.delivered?.share)}`,
  ];
}

/** The summary as markdown. Pure: everything it says comes from its arguments. */
export function refreshSummary(manifest: ReportManifest, network: Weekly, routes: readonly SummaryRoute[], match: MatchReport | null, extras: SummaryExtras = {}): string {
  const lines: string[] = ['## Live report refresh', ''];
  lines.push(`Built ${manifest.generatedAt ?? '?'}. ${manifest.routes.length} route files: ${manifest.routes.join(', ')}.`, '');
  lines.push('### Weeks covered', '', '| Week | Dates | Days with good recordings (network) |', '|---|---|---|');
  lines.push(`| This week | ${manifest.thisWeek ? `${manifest.thisWeek.from} to ${manifest.thisWeek.to}` : 'none'} | ${goodDays(network?.thisWeek)} |`);
  lines.push(`| Last week | ${manifest.lastWeek ? `${manifest.lastWeek.from} to ${manifest.lastWeek.to}` : 'none'} | ${goodDays(network?.lastWeek)} |`);
  if (network && network.comparable === false) lines.push('', 'The two weeks are NOT comparable (too few days with good recordings in one of them).');

  lines.push('', '### Positions matched to the timetable, per service date', '');
  if (!match) lines.push('No match report was given.');
  else {
    lines.push(`Timetables used: ${match.feeds.map(f => `${f.key} (${f.start}-${f.end})`).join(', ')}. A day fails below ${pct(match.minShare)}.`, '');
    lines.push('A day also fails when another timetable matches more of its trip ids than the one chosen.', '');
    lines.push('| Service date | Timetable | Trip ids matched | Share | Other timetables | |', '|---|---|---|---|---|---|');
    for (const d of match.days) lines.push(`| ${d.date} | ${d.feed ?? '–'} | ${d.matched}/${d.total} | ${d.total ? pct(d.share) : 'no positions'} | ${(d.others ?? []).map(o => `${o.feed} ${pct(o.share)}`).join(', ') || '–'} | ${d.problem ?? ''} |`);
  }

  lines.push('', '### Snapshots the fetch could not read', '');
  const fetch = extras.fetch;
  if (!fetch) lines.push('No fetch report was given.');
  else {
    const fetched = fetch.days.filter(d => !d.skipped);
    const failed = fetched.filter(d => d.failed > 0);
    lines.push(`${fetched.length} day folders fetched, ${fetch.days.length - fetched.length} already complete from an earlier run. The run fails when a day loses more than ${pct(fetch.maxFailedShare)} of its snapshots.`);
    lines.push(failed.length ? `Could not read: ${failed.map(d => `${d.day} ${d.failed} of ${d.snapshots}`).join(', ')}.` : 'Every snapshot was read.');
    const empty = fetched.filter(d => d.snapshots === 0);
    if (empty.length) lines.push(`No snapshots at all in the archive for: ${empty.map(d => d.day).join(', ')}.`);
  }

  // Days left out of the weekly figures, with the routes that say so (recordings are network-wide, so usually all of them).
  lines.push('', '### Days left out for poor recordings', '');
  const bad = new Map<string, { routes: string[]; snapshots: number }>();
  for (const r of routes) for (const h of r.weekly?.health ?? []) {
    if (h.healthy) continue;
    const e = bad.get(h.date) ?? { routes: [], snapshots: h.snapshots };
    e.routes.push(r.route);
    bad.set(h.date, e);
  }
  const ready = routes.filter(r => r.status === 'ready').length;
  if (!bad.size) lines.push('None.');
  else for (const [date, e] of [...bad].sort()) lines.push(`- ${date}: ${e.snapshots} snapshots (${e.routes.length === ready ? 'every route' : `routes ${e.routes.join(', ')}`})`);

  lines.push('', '### Runs matched to the timetable, per route', '', '| Route | Runs | Trip number swapped, reassigned | Dropped | No timetable trip | Share with no timetable trip |', '|---|---|---|---|---|---|');
  for (const r of routes) {
    const c = r.runs;
    if (r.status !== 'ready' || !c) { lines.push(`| ${r.route} | ${r.status === 'ready' ? '–' : r.status} | – | – | – | – |`); continue; }
    lines.push(`| ${r.route} | ${c.runs} | ${c.reassigned} | ${c.dropped} | ${c.noTimetableTrip} | ${pct(c.kept + c.noTimetableTrip > 0 ? c.noTimetableTrip / (c.kept + c.noTimetableTrip) : null)} |`);
  }

  lines.push('', '### Published now against this build (each one\'s own "this week")', '');
  const pub = extras.published;
  if (!pub) lines.push('No copy of the published files was given.');
  else {
    lines.push(`Published: ${span(pub.network?.thisWeek)}, built ${pub.manifest.generatedAt ?? '?'}. New: ${span(network?.thisWeek)}. Different weeks, so a change is the service changing as well as the data.`, '');
    lines.push('| Route | Late | Trip time over (min) | Extra wait (min) | Uneven gaps | Delivered |', '|---|---|---|---|---|---|');
    lines.push(`| Network | ${changeCells(pub.network?.thisWeek, network?.thisWeek).join(' | ')} |`);
    const was = new Map(pub.routes.map(r => [r.route, r]));
    for (const r of routes) {
      const old = was.get(r.route);
      if (r.status !== 'ready' || !old || old.status !== 'ready') { lines.push(`| ${r.route} | ${old ? old.status : 'not published'} -> ${r.status} | – | – | – | – |`); continue; }
      lines.push(`| ${r.route} | ${changeCells(old.weekly?.thisWeek, r.weekly?.thisWeek).join(' | ')} |`);
    }
    const gone = pub.routes.filter(o => !routes.some(r => r.route === o.route)).map(o => o.route);
    if (gone.length) lines.push('', `Published now but not in this build: ${gone.join(', ')}.`);
  }

  const head = '| Route | Good days | Late (departures) | Trip time over | Extra wait | Uneven gaps | Delivered |';
  const rule = '|---|---|---|---|---|---|---|';
  for (const [title, pick] of [['This week', (w: Weekly) => w?.thisWeek], ['Last week', (w: Weekly) => w?.lastWeek]] as const) {
    const net = pick(network);
    lines.push('', `### ${title}: ${span(net)}`, '', head, rule);
    lines.push(`| Network | ${goodDays(net)} | ${cells(net).join(' | ')} |`);
    for (const r of routes) {
      if (r.status !== 'ready') { lines.push(`| ${r.route} | ${r.status} | – | – | – | – | – |`); continue; }
      const w = pick(r.weekly);
      lines.push(`| ${r.route} | ${goodDays(w)} | ${cells(w).join(' | ')} |`);
    }
  }
  return lines.join('\n') + '\n';
}

type RouteBody = { status: string; v3?: { weekly?: Weekly; totals?: { runs?: number }; swaps?: { reassigned?: number; dropped?: number }; leftOut?: { noTimetableTrip?: number; kept?: number } } };

/** Reads one folder of report files (the built set, or a copy of the published one) into what the summary needs. */
export function readSet(dir: string): PublishedSet {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const routes: SummaryRoute[] = readdirSync(dir).filter(n => /^[A-Za-z0-9]+\.json$/.test(n) && n !== 'manifest.json' && n !== 'agency.json' && n !== 'BACKUP.json')
    .map(n => n.slice(0, -5)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(route => {
      const body = read(`${route}.json`) as RouteBody;
      const v = body.v3;
      const runs = v?.totals?.runs != null ? { runs: v.totals.runs, reassigned: v.swaps?.reassigned ?? 0, dropped: v.swaps?.dropped ?? 0, noTimetableTrip: v.leftOut?.noTimetableTrip ?? 0, kept: v.leftOut?.kept ?? 0 } : null;
      return { route, status: body.status, weekly: v?.weekly, runs };
    });
  return { manifest: read('manifest.json') as ReportManifest, network: (read('agency.json') as { summary?: { weekly?: Weekly } }).summary?.weekly, routes };
}

function main() {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i] ?? '';
  if (!args.files) { console.error('live-refresh-summary: give --files <dir of built files>'); process.exit(2); }
  const json = <T>(path: string | undefined): T | null => (path && existsSync(resolve(path)) ? JSON.parse(readFileSync(resolve(path), 'utf8')) as T : null);
  const built = readSet(resolve(args.files));
  // A published copy without a manifest (first publish, or the download failed) is reported as missing, not an error.
  const published = args.published && existsSync(join(resolve(args.published), 'manifest.json')) && existsSync(join(resolve(args.published), 'agency.json')) ? readSet(resolve(args.published)) : null;
  const text = refreshSummary(built.manifest, built.network, built.routes, json<MatchReport>(args.match), { fetch: json<FetchReport>(args.fetch), published });
  if (args.out) writeFileSync(resolve(args.out), text);
  process.stdout.write(text);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-refresh-summary.ts')) main();
