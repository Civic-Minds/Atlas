/**
 * The Live "Yesterday" files (CIV-278): for each analysed route, the latest service day in its analysis against the
 * same weekday a week before, plus the network, written as atlas/live/<agency>/yesterday/<route>.json, agency.json and
 * manifest.json. Run after the analyses (npm run live:yesterday does both); --upload sends that prefix only to R2.
 *   npx tsx scripts/live-yesterday.ts ttc [--upload]
 */
import '../pipeline/loadEnv.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { LIVE_ANALYSIS_ROUTES } from '../shared/livePollingConfig';
import { LIVE_DASHBOARD_HOLD, type LiveV3 } from '../shared/liveDashboard';
import { agencyYesterday, yesterdayFromV3, type LiveYesterday } from '../shared/liveYesterday';

const args = process.argv.slice(2);
const agency = args.find(a => !a.startsWith('--')) ?? 'ttc';
const upload = args.includes('--upload');
if (!/^[a-z0-9-]+$/.test(agency)) throw new Error(`live:yesterday: bad agency "${agency}"`);
const data = resolve(process.env.LIVE_DATA ?? '../_live-data');
const PREFIX = `atlas/live/${agency}/yesterday/`;
const outDir = join(data, 'publish', PREFIX);
mkdirSync(outDir, { recursive: true });

const routes = LIVE_ANALYSIS_ROUTES.filter(k => k.startsWith(`${agency}::`)).map(k => k.split('::')[1]).filter(r => !LIVE_DASHBOARD_HOLD[`${agency}::${r}`]);
const days: LiveYesterday[] = [];
const files: Array<{ name: string; body: unknown }> = [];
for (const route of routes) {
  const file = join(data, 'out', `${agency}-${route}-segments.json`);
  if (!existsSync(file)) { console.warn(`live:yesterday: no analysis for ${route}`); continue; }
  const y = yesterdayFromV3(JSON.parse(readFileSync(file, 'utf8')).v3 as LiveV3, agency, route);
  if (!y) { console.warn(`live:yesterday: ${route} has no daily figures (rebuild the analysis)`); continue; }
  days.push(y);
  files.push({ name: `${route}.json`, body: y });
}
const net = agencyYesterday(agency, days);
if (!net) throw new Error('live:yesterday: no route had daily figures');
const mismatched = days.filter(d => d.date !== net.date).map(d => `${d.route} (${d.date})`);
if (mismatched.length) console.warn(`live:yesterday: left out of the network, different latest day: ${mismatched.join(', ')}`);
files.push({ name: 'agency.json', body: net });
files.push({ name: 'manifest.json', body: { schema: 1, agency, date: net.date, compareDate: net.compareDate, routes: days.map(d => d.route), builtAt: new Date().toISOString() } });
for (const f of files) writeFileSync(join(outDir, f.name), JSON.stringify(f.body));
const pct = (x: number | null | undefined) => (x == null ? '–' : `${Math.round(x * 1000) / 10}%`);
console.log(`live:yesterday: ${net.date} against ${net.compareDate}, network late ${pct(net.weekly.thisWeek.late?.share)} (was ${pct(net.weekly.lastWeek.late?.share)}); wrote ${files.length} files to ${outDir}`);

if (upload) {
  const { r2PutFile } = await import('../pipeline/r2');
  for (const f of files) {
    const key = `${PREFIX}${f.name}`;
    if (!key.startsWith(`atlas/live/${agency}/yesterday/`)) throw new Error(`live:yesterday: refusing key ${key}`);
    await r2PutFile(key, join(outDir, f.name), 'application/json', { cacheControl: 'public, max-age=300' });
    console.log(`  uploaded ${key}`);
  }
}
