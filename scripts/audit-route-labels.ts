/**
 * Dump how every route of every agency is labelled on each surface, calling exactly what each real site calls with exactly
 * the inputs it has, so a change to the route-label rules can be diffed before and after and any surface that names a route
 * differently from the others shows up.
 *
 *   npx tsx scripts/audit-route-labels.ts <out.json> [--feeds <dir>] [--slugs slug,slug]
 *
 * Inputs come from the raw feeds: each agency's newest zip in <feeds>/<slug>/*.zip (default ../_feeds, the Atlas-worktrees
 * feed folder), its routes.txt short name, long name and route_type (the value the map features carry), and the agency's
 * name from config/agencies/<slug>.json. Agency pages store an effective mode instead of a route type; the audit works it out
 * with the same `effectiveMode` the summaries builder uses.
 *
 * Each entry is one route with the text each surface shows (primary — secondary on one line). `differs` lists the surfaces
 * whose text is not the card's. Surfaces that by design lack an input (a recent route saved by an older build, which has no
 * route type) are listed separately and never count as a difference.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { strFromU8, unzipSync } from 'fflate';
import { routeLabels, shortenAgencyName } from '../src/utils/format';
import { routeRowLabels } from '../src/components/Interval/SearchSuggestionsPanel';
import { effectiveMode } from '../shared/modes';

type Route = { slug: string; agencyName: string; short: string; long: string | null; type: number };
type Site = { name: string; byDesign?: boolean; label: (r: Route) => string };

const one = (l: { primary: string; secondary?: string }) => (l.secondary ? `${l.primary} — ${l.secondary}` : l.primary);
const row = (l: { shortName: string; name?: string }) => (l.name ? `${l.shortName} — ${l.name}` : l.shortName);

/** Every place a route is named, with the call and inputs that site uses (file:line on chore/ui-consolidate-9). */
const SITES: Site[] = [
  // RouteCardTitle via RouteCardHeadway: route_type from the route's features, slug from the route key, shortened agency name.
  { name: 'card', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: shortenAgencyName(r.agencyName) }).text },
  // SearchResultsList / MapContextPanel / suggested routes (SidebarControls notableRoutes): routeRowLabels with type and slug.
  { name: 'list', label: r => row(routeRowLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: r.agencyName })) },
  // Recently viewed, saved by this build (routeType stored with the entry).
  { name: 'recent', label: r => row(routeRowLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: shortenAgencyName(r.agencyName) })) },
  // AgencyPage: the stored effective mode, full agency name.
  { name: 'agencyPage', label: r => one(routeLabels({ shortName: r.short, longName: r.long, mode: effectiveMode({ routeType: r.type, routeShortName: r.short, routeLongName: r.long, agencySlug: r.slug }), agencyName: r.agencyName })) },
  // AgencyCard route rows: type and slug, no agency name.
  { name: 'agencyCard', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug }).text },
  // useNearbyRoutes and NightService: type, slug, full agency name.
  { name: 'nearby', label: r => one(routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: r.agencyName })) },
  { name: 'night', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: r.agencyName }).text },
  // FilterPanel hidden routes (Settings).
  { name: 'settings', label: r => one(routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: r.agencyName })) },
  // StopRouteGroup: agency name only when the stop has several agencies; StopCard nearby connections; DisambiguationPanel; MapCanvas hover.
  { name: 'stopRoute', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug }).text },
  { name: 'stopRouteMultiAgency', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: shortenAgencyName(r.agencyName) }).text },
  { name: 'stopNearby', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: shortenAgencyName(r.agencyName) }).text },
  { name: 'disambiguation', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: shortenAgencyName(r.agencyName) }).text },
  { name: 'mapHover', label: r => routeLabels({ shortName: r.short, longName: r.long, routeType: r.type, agencySlug: r.slug, agencyName: r.agencyName }).text },
  // A recent route saved by an older build carries no route type, so it falls back to the bus rule.
  { name: 'recentOldEntry', byDesign: true, label: r => row(routeRowLabels({ shortName: r.short, longName: r.long, agencyName: shortenAgencyName(r.agencyName) })) },
];

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '', cur: string[] = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = ''; if (cur.some(x => x !== '')) rows.push(cur); cur = [];
    } else field += c;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  const [head, ...body] = rows;
  const keys = (head ?? []).map(k => k.replace(/^﻿/, '').trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function readRoutes(feeds: string, slugs?: string[]): Route[] {
  const out: Route[] = [];
  const all = readdirSync(feeds).filter(s => !s.startsWith('_') && statSync(join(feeds, s)).isDirectory());
  for (const slug of slugs ?? all) {
    const dir = join(feeds, slug);
    if (!existsSync(dir)) { console.error('no feed folder', slug); continue; }
    const zips = readdirSync(dir).filter(f => f.endsWith('.zip')).map(f => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (!zips.length) continue;
    const cfgPath = join('config/agencies', `${slug}.json`);
    const agencyName = existsSync(cfgPath) ? (JSON.parse(readFileSync(cfgPath, 'utf8')).name as string) ?? slug : slug;
    let files: Record<string, Uint8Array>;
    try { files = unzipSync(readFileSync(zips[0]), { filter: f => /(^|\/)routes\.txt$/.test(f.name) }); } catch { console.error('bad zip', zips[0]); continue; }
    const name = Object.keys(files)[0];
    if (!name) continue;
    for (const r of parseCsv(strFromU8(files[name]))) {
      out.push({ slug, agencyName, short: r.route_short_name ?? '', long: r.route_long_name || null, type: Number(r.route_type || 3) });
    }
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const out = args[0];
  if (!out) { console.error('usage: audit-route-labels.ts <out.json> [--feeds dir] [--slugs a,b]'); process.exit(1); }
  const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const feeds = resolve(opt('--feeds') ?? '../_feeds');
  const routes = readRoutes(feeds, opt('--slugs')?.split(','));
  const rows = routes.map(r => {
    const labels = Object.fromEntries(SITES.map(s => [s.name, s.label(r)]));
    const differs = SITES.filter(s => !s.byDesign && labels[s.name].toLowerCase() !== labels.card.toLowerCase()).map(s => s.name);
    return { slug: r.slug, short: r.short, long: r.long, type: r.type, ...labels, differs };
  });
  writeFileSync(out, JSON.stringify(rows, null, 1));
  const agencies = new Set(rows.map(r => r.slug)).size;
  const bad = rows.filter(r => r.differs.length);
  const bySite: Record<string, number> = {};
  for (const r of bad) for (const s of r.differs) bySite[s] = (bySite[s] ?? 0) + 1;
  console.log(`${rows.length} routes from ${agencies} agencies -> ${out}`);
  console.log(`routes where a surface differs from the card (case-insensitive): ${bad.length}`, bySite);
  const oldRecent = rows.filter(r => r.recentOldEntry.toLowerCase() !== r.list.toLowerCase()).length;
  console.log(`routes an old saved recent (no route type) would name differently: ${oldRecent}`);
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('audit-route-labels.ts')) main();
