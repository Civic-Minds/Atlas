/**
 * Publish the Live report data as static JSON, so the route and agency pages work on Vercel without any Live endpoint.
 *   npx tsx scripts/live-publish.ts ttc            write ../_live-data/publish/atlas/live/ttc/*.json (no upload)
 *   npx tsx scripts/live-publish.ts ttc --upload   also upload them to R2 under atlas/live/ttc/ (that prefix only)
 * Each file is exactly what the local API answers (local-api/live-dashboard.ts, live-agency.ts), so dev and the
 * published pages read the same thing. manifest.json holds when the data was built and which weeks it covers.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import dashboard from '../local-api/live-dashboard';
import agencyApi from '../local-api/live-agency';
import { LIVE_POLLING_ROUTES } from '../shared/livePollingConfig';
import type { AgencySummary } from '../shared/liveAgency';

const args = process.argv.slice(2);
const agency = args.find(a => !a.startsWith('--')) ?? 'ttc';
const upload = args.includes('--upload');
if (!/^[a-z0-9-]+$/.test(agency)) throw new Error(`live:publish: bad agency "${agency}"`);
const PREFIX = `atlas/live/${agency}/`;
const outDir = resolve(process.env.LIVE_DATA ?? '../_live-data', 'publish', PREFIX);
mkdirSync(outDir, { recursive: true });

const answer = async (api: { fetch: (r: Request) => Promise<Response> }, query: string) => (await api.fetch(new Request(`http://localhost/${query}`))).json();

const files: Array<{ name: string; body: unknown }> = [];
const routes = LIVE_POLLING_ROUTES.filter(c => c.slug === agency).map(c => c.displayRouteShortName);
const published: string[] = [];
for (const route of [...new Set(routes)]) {
  const body = await answer(dashboard, `?agency=${agency}&route=${encodeURIComponent(route)}`) as { status: string };
  // Ready routes and held routes (their page says why); a route with no analysis gets no file, so its page says "no route".
  if (body.status !== 'ready' && body.status !== 'held') continue;
  files.push({ name: `${route}.json`, body });
  published.push(route);
}
const agencyBody = await answer(agencyApi, `?agency=${agency}`) as { status: string; summary?: AgencySummary };
if (agencyBody.status !== 'ready' || !agencyBody.summary) throw new Error(`live:publish: no agency summary for ${agency} (${agencyBody.status}). Run npm run live:analyze first.`);
files.push({ name: 'agency.json', body: agencyBody });
const w = agencyBody.summary.weekly;
files.push({
  name: 'manifest.json',
  body: {
    schema: 1, agency, generatedAt: agencyBody.summary.generatedAt, publishedAt: new Date().toISOString(),
    thisWeek: w ? { from: w.thisWeek.dates[0], to: w.thisWeek.dates.at(-1) } : null,
    lastWeek: w ? { from: w.lastWeek.dates[0], to: w.lastWeek.dates.at(-1) } : null,
    routes: published,
  },
});

for (const f of files) writeFileSync(join(outDir, f.name), JSON.stringify(f.body));
console.log(`live:publish: wrote ${files.length} files to ${outDir} (routes ${published.join(', ')})`);

if (upload) {
  const { r2PutFile } = await import('../pipeline/r2');
  for (const f of files) {
    const key = `${PREFIX}${f.name}`;
    if (!key.startsWith('atlas/live/')) throw new Error(`live:publish: refusing key ${key}`);
    await r2PutFile(key, join(outDir, f.name), 'application/json', { cacheControl: 'public, max-age=300' });
    console.log(`  uploaded ${key}`);
  }
}
