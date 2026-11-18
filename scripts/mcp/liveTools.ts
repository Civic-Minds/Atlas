/**
 * The MCP's Live tools (CIV-1860): route_reliability and route_bunching, from Atlas Live's recordings through
 * shared/liveReliability.ts. Each answer states what Live has recorded for the agency (shared/liveCoverage.ts).
 */
import { PERIOD_LABELS, formatPeriodRange } from '../../shared/config';
import * as data from './atlasData';
import { liveReader } from './liveData';
import { LIVE_ARCHIVE_SLUGS, coverageLimits } from '../../shared/liveCoverage';
import { RELIABILITY_BANDS, RELIABILITY_DEFINITION_TEXT } from '../../shared/liveReliability';
import { type Args } from './toolHelpers';

const LIVE_SOURCE = "Atlas Live's recordings of where vehicles were, matched to the timetable: past service, not how the route is running right now.";
/** The meaning of every Live figure, worded from the shared rules (shared/rules/live.ts). */
const LIVE_DEFINITIONS = {
  ...RELIABILITY_DEFINITION_TEXT,
  shares: 'Shares are fractions: 0.093 means 9.3% of departures. Give them as percentages, never as "1 in N" or "4 in 10".',
};
const bandLabel = (k: string) => (k === 'all' ? 'All day' : `${PERIOD_LABELS[k as keyof typeof PERIOD_LABELS]} (${formatPeriodRange(k as Parameters<typeof formatPeriodRange>[0])})`);
function liveBand(p: unknown): string | null {
  if (p == null || p === '' || /^all/i.test(String(p))) return null;
  const k = RELIABILITY_BANDS.find(b => b !== 'all' && PERIOD_LABELS[b as keyof typeof PERIOD_LABELS].toLowerCase() === String(p).toLowerCase());
  if (!k) throw new Error(`Part of the day must be one of: All day, ${RELIABILITY_BANDS.filter(b => b !== 'all').map(b => PERIOD_LABELS[b as keyof typeof PERIOD_LABELS]).join(', ')}.`);
  return k;
}
const liveWeeks = (m: { thisWeek: { from: string; to: string } | null; lastWeek: { from: string; to: string } | null }) => ({ thisWeek: m.thisWeek, lastWeek: m.lastWeek });
/** Any public agency, whether or not its route files are on hand: Live figures don't need them. */
async function liveAgencyFor(q: unknown) {
  const a = await data.findAgency(String(q ?? ''), await data.publicAgencies());
  if (!a) throw new Error(`No agency matches "${q}". Use list_agencies to search.`);
  return a;
}
async function liveAgency(a: { slug: string; name: string }) {
  const [manifest, coverage] = await Promise.all([liveReader().manifest(a.slug), liveReader().coverage(a.slug)]);
  // Each answer states what Live has recorded for the agency (CIV-1860, Ryan: "mention the limits right now if applicable").
  const limits = coverage ? coverageLimits(coverage, manifest?.routes.length ?? 0) : undefined;
  if (!manifest) {
    const note = !LIVE_ARCHIVE_SLUGS.includes(a.slug)
      ? `Atlas does not record Live data for ${a.name}, so it has no figures for how its routes actually ran. It has the published schedule (route_frequency).`
      : `Atlas records Live data for ${a.name} but has no figures for it yet. It has the published schedule (route_frequency).`;
    return { none: { agency: a.name, live: null, note, ...(limits ? { limits } : {}) } };
  }
  return { manifest, limits };
}
async function liveRoute(a: { slug: string; name: string }, m: { routes: string[] }, route: unknown, limits?: string[]) {
  const q = String(route ?? '').trim().toLowerCase();
  const id = m.routes.find(r => r.toLowerCase() === q) ?? m.routes.find(r => q.startsWith(`${r.toLowerCase()} `));
  if (!id) return { none: { agency: a.name, live: null, routesWithFigures: m.routes, note: `Atlas has Live figures for ${a.name} only on these routes; "${route}" is not one of them.`, ...(limits ? { limits } : {}) } };
  const file = await liveReader().route(a.slug, id);
  if (!file) return { none: { agency: a.name, live: null, note: `Atlas has no Live figures for route ${id} yet.` } };
  return { file };
}

/** The Live tools (CIV-1860). The hosted pilot hides them until Ryan decides whether testers see Live figures. */
export const LIVE_TOOLS: readonly string[] = ['route_reliability', 'route_bunching'];

export const liveHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  route_reliability: async ({ agency: q, route, period: p }) => {
    const band = liveBand(p);
    const a = await liveAgencyFor(q);
    const live = await liveAgency(a);
    if ('none' in live) return live.none;
    if (route == null || String(route).trim() === '') {
      const r = await liveReader().ranking(a.slug);
      if (!r) return { agency: a.name, ranking: null, note: 'Atlas has no ranking of recorded routes for this agency.' };
      const routes = [...r.routes].sort((x, y) => (y.lateShare ?? -1) - (x.lateShare ?? -1)).map(x => ({ route: x.route, name: x.titleLabel, lateShare: x.lateShare, lateShareLastWeek: x.lateLastWeek, departures: x.lateN, bunchedOrGappedShare: x.bunchingShare, deliveredShare: x.deliveredShare }));
      return { agency: a.name, ...liveWeeks(live.manifest), measured: 'Whole day, this week, most often late first.', routes, held: r.held.map(h => h.route), ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE };
    }
    const f = await liveRoute(a, live.manifest, route, live.limits);
    if ('none' in f) return f.none;
    const bands = Object.fromEntries(Object.entries(f.file.reliability.bands).filter(([k]) => !band || k === band).map(([k, v]) => [bandLabel(k), v]));
    return { agency: a.name, route: f.file.routeTitle, ...liveWeeks(live.manifest), directions: f.file.reliability.directions, weeksComparable: f.file.reliability.weeksComparable, byPartOfDay: bands, ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE };
  },
  route_bunching: async ({ agency: q, route, period: p }) => {
    const band = liveBand(p);
    const a = await liveAgencyFor(q);
    const live = await liveAgency(a);
    if ('none' in live) return live.none;
    const f = await liveRoute(a, live.manifest, route, live.limits);
    if ('none' in f) return f.none;
    const bands = Object.fromEntries(Object.entries(f.file.bunching.bands).filter(([k]) => !band || k === band).map(([k, v]) => [bandLabel(k), v]));
    return { agency: a.name, route: f.file.routeTitle, ...liveWeeks(live.manifest), byPartOfDay: bands, ...(live.limits ? { limits: live.limits } : {}), definitions: LIVE_DEFINITIONS, source: LIVE_SOURCE, note: 'startShare is the share of bunched or gapped gaps where the route starts; formsAt is the stretch where it forms (pattern "forms") or rises most; risePoints is how many percentage points it rises across that stretch.' };
  },
};
