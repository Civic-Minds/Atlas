/** CIV-238 verify (research only, never merged): cells passing the filter without vs with the edge-wait mask. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { featurePassesHeadwayFilter, normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter';
const dir = process.argv[2] ?? 'tmp/derived-reprocess';
const PERIODS = ['amPeak', 'midday', 'pmPeak', 'evening'] as const, DAYS = ['Weekday', 'Saturday', 'Sunday'], NS = [10, 15, 20, 30, 60];
const slugs = readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && existsSync(path.join(dir, e.name, `${e.name}.json`))).map(e => e.name);
const t = Object.fromEntries(NS.map(n => [n, { before: 0, after: 0, agencies: new Set<string>() }]));
for (const slug of slugs) {
  const feats = (JSON.parse(readFileSync(path.join(dir, slug, `${slug}.json`), 'utf8')).features ?? []).filter((f: any) => f.properties?.routeShortName != null && f.geometry?.type !== 'Point');
  for (const f of feats) f.properties.agencySlug ??= slug;
  normalizeRouteFilterFeatures(feats);
  const routes = new Map<string, any[]>();
  for (const f of feats) { const k = `${f.properties.routeId}${f.properties.routeBranch ? '::' + f.properties.routeBranch : ''}`; routes.set(k, [...(routes.get(k) ?? []), f.properties]); }
  for (const rows of routes.values()) {
    const bare = rows.map(p => { const { routeEdgeWaitFailByPeriod, ...rest } = p; return rest; });
    for (const day of DAYS) for (const period of PERIODS) for (const n of NS) {
      const b = bare.some(p => p.day === day && featurePassesHeadwayFilter(p, period, n));
      const a = rows.some(p => p.day === day && featurePassesHeadwayFilter(p, period, n));
      if (b) t[n].before++;
      if (a) t[n].after++;
      if (b && !a) t[n].agencies.add(slug);
    }
  }
}
mkdirSync('tmp/civ238', { recursive: true });
const lines = ['# CIV-238 verify', '', '| N | passing without the mask | passing with it | no longer pass | agencies |', '|---|---|---|---|---|', ...NS.map(n => `| ${n} | ${t[n].before} | ${t[n].after} | ${t[n].before - t[n].after} | ${t[n].agencies.size} |`), ''];
writeFileSync('tmp/civ238/summary.md', lines.join('\n'));
console.log(lines.join('\n'));
