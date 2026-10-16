/**
 * Dump how every route of some agencies is labelled on each surface (cards, list rows, suggestions, agency page, Nearby, agency
 * card, Night), so a change to the route-label rules can be diffed before and after.
 *
 *   npx tsx scripts/audit-route-labels.ts <out.json> [slug,slug,...]
 *
 * Reads the agency page summaries (shared/data/agency-pages.json: each route's short name, long name and mode). `mode` stands in
 * for route_type (it is the same for rail, ferry and bus). Each entry is one route with the text each surface shows.
 */
import { readFileSync, writeFileSync } from 'fs';
import { routeLabels } from '../src/utils/format';
import { routeRowLabels } from '../src/components/Interval/SearchSuggestionsPanel';

const [, , out, slugsArg] = process.argv;
const SLUGS = (slugsArg ?? 'ttc,go,mbta,cta,translink,lacmta,cttransit,stm,smart,hrt').split(',');
const data = JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')) as { agencies: Array<{ slug: string; name: string; routes: Array<{ name: string; longName: string | null; mode: number }> }> };
const join = (a: string, b?: string | null, sep = ' | ') => [a, b].filter(Boolean).join(sep);

const rows: Record<string, unknown>[] = [];
for (const slug of SLUGS) {
  const agency = data.agencies.find(a => a.slug === slug);
  if (!agency) { console.error('no agency', slug); continue; }
  for (const r of agency.routes) {
    const short = r.name, long = r.longName, type = r.mode;
    const l = routeLabels({ shortName: short, longName: long, routeType: type, agencyName: agency.name });
    const list = routeRowLabels(short, long, type, agency.name);
    const sugg = routeRowLabels(short, long);
    rows.push({
      slug, short, long, type,
      card: l.full,
      list: join(list.shortName, list.name),
      suggest: join(sugg.shortName, sugg.name),
      agencyPage: join(l.primary, l.secondary),
      agencyCard: routeLabels({ shortName: short, longName: long, routeType: type }).text,
      nearby: join(l.secondary ? l.primary : '', l.secondary ?? l.primary),
      night: l.text,
    });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`${rows.length} routes from ${SLUGS.length} agencies -> ${out}`);
