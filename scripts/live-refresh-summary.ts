/**
 * A short, readable summary of a Live report refresh (CIV-1407), for review before the files are published: the weeks
 * covered, the days with good recordings in each, how well each day's positions matched its timetable, and each
 * route's headline numbers for this week and last.
 *
 *   npx tsx scripts/live-refresh-summary.ts --files <dir of built files> [--match <report.json>] [--out <summary.md>]
 *
 * Reads only local files: the set scripts/live-publish.ts wrote and the report of scripts/live-gtfs-for-window.ts.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WeekMetrics } from '../shared/liveDashboard';
import type { WindowDayMatch } from './live-gtfs-for-window';
import type { ReportManifest } from './live-publish-upload';

type Weekly = { thisWeek: WeekMetrics; lastWeek: WeekMetrics; comparable?: boolean } | null | undefined;
export interface SummaryRoute { route: string; status: string; weekly: Weekly }
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

/** The summary as markdown. Pure: everything it says comes from its arguments. */
export function refreshSummary(manifest: ReportManifest, network: Weekly, routes: readonly SummaryRoute[], match: MatchReport | null): string {
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
    lines.push('| Service date | Timetable | Trip ids matched | Share | |', '|---|---|---|---|---|');
    for (const d of match.days) lines.push(`| ${d.date} | ${d.feed ?? '–'} | ${d.matched}/${d.total} | ${d.total ? pct(d.share) : 'no positions'} | ${d.problem ?? ''} |`);
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

function main() {
  const argv = process.argv.slice(2);
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i] ?? '';
  if (!args.files) { console.error('live-refresh-summary: give --files <dir of built files>'); process.exit(2); }
  const dir = resolve(args.files);
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const manifest = read('manifest.json') as ReportManifest;
  const network = (read('agency.json') as { summary?: { weekly?: Weekly } }).summary?.weekly;
  const routes: SummaryRoute[] = readdirSync(dir).filter(n => n.endsWith('.json') && n !== 'manifest.json' && n !== 'agency.json')
    .map(n => n.slice(0, -5)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(route => { const body = read(`${route}.json`) as { status: string; v3?: { weekly?: Weekly } }; return { route, status: body.status, weekly: body.v3?.weekly }; });
  const match = args.match && existsSync(resolve(args.match)) ? JSON.parse(readFileSync(resolve(args.match), 'utf8')) as MatchReport : null;
  const text = refreshSummary(manifest, network, routes, match);
  if (args.out) writeFileSync(resolve(args.out), text);
  process.stdout.write(text);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('live-refresh-summary.ts')) main();
