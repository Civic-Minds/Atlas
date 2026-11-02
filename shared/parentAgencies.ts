/**
 * CIV-1277: parent agencies, display only. An agency split across feeds (MTA New York's subway, borough buses and
 * railroads; exo's sectors) stays one agency per feed in the data; its parent (config/parent-agencies.json, named by each
 * member's `parentAgency`) gets one page that adds its members up, as SEPTA's and LA Metro's pages do for their merged
 * bus and rail feeds. Every number comes from the members' own summaries.
 */
import { agencyPageData, type AgencyPageData, type AgencyPageRoute, type AgencyPageSummary } from './agencyPages';
import { agencyGroupData, type AgencyGroupData } from './areaPages';
import { PARENT_AGENCIES, type ParentAgency } from './parentAgencyList';

export { PARENT_AGENCIES, parentAgency, type ParentAgency } from './parentAgencyList';

/** The members of a parent, most routes first (ties by slug). */
export function parentMembers<T extends Pick<AgencyPageSummary, 'slug' | 'parentAgency' | 'routes'>>(parent: Pick<ParentAgency, 'slug'>, all: readonly T[]): T[] {
  return all.filter(a => a.parentAgency === parent.slug).sort((x, y) => y.routes.length - x.routes.length || x.slug.localeCompare(y.slug));
}

/**
 * The members' routes with each route once: a route in two members' feeds with the same name, mode and long name counts
 * once (the first member's row). exo's sectors reuse numbers for different buses ("1" Valleyfield, "1" Terrebonne), and
 * their long names differ, so both count.
 */
export function parentRoutes(members: ReadonlyArray<Pick<AgencyPageSummary, 'routes'>>): AgencyPageRoute[] {
  const seen = new Set<string>();
  const out: AgencyPageRoute[] = [];
  for (const m of members) for (const r of m.routes) {
    const key = `${r.name}\u0000${r.mode}\u0000${r.longName ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** The member a parent takes its place from: the one on the parent's own slug (exo's trains), else the one with most routes. */
export function parentHome<T extends Pick<AgencyPageSummary, 'slug'>>(parent: Pick<ParentAgency, 'slug'>, members: readonly T[]): T | undefined {
  return members.find(m => m.slug === parent.slug) ?? members[0];
}

const earliest = (xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x).sort()[0] ?? null;
const latest = (xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x).sort().at(-1) ?? null;

/**
 * A parent as one agency summary, from its members: their routes once each, the biggest member's place, every member's
 * map extent, connections to agencies outside the parent. No stop count: a station two members share would count twice.
 */
export function parentSummary(parent: ParentAgency, members: readonly AgencyPageSummary[]): AgencyPageSummary {
  const home = parentHome(parent, members)!;
  const routes = parentRoutes(members);
  const boxes = members.map(m => m.bbox).filter((b): b is [number, number, number, number] => !!b);
  const inside = new Set(members.map(m => m.slug));
  const connections = new Map<string, NonNullable<AgencyPageSummary['connections']>[number]>();
  for (const m of members) for (const c of m.connections ?? []) {
    if (inside.has(c.slug)) continue;
    const had = connections.get(c.slug);
    connections.set(c.slug, had ? { ...had, routes: [...new Set([...had.routes, ...c.routes])] } : c);
  }
  const spans = members.map(m => m.span).filter((s): s is NonNullable<typeof s> => !!s);
  return {
    slug: parent.slug,
    name: parent.name,
    displayName: parent.name,
    city: home.city,
    region: home.region,
    country: home.country,
    center: home.center,
    ...(boxes.length ? { bbox: [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))] as [number, number, number, number] } : {}),
    ...(parent.websiteUrl ? { websiteUrl: parent.websiteUrl } : {}),
    routeCount: routes.length,
    routes,
    connections: [...connections.values()].sort((x, y) => y.routes.length - x.routes.length || x.name.localeCompare(y.name)),
    span: spans.length ? { first: Math.min(...spans.map(s => s.first)), last: Math.max(...spans.map(s => s.last)) } : null,
    lastRefreshedAt: latest(members.map(m => m.lastRefreshedAt)),
    validThrough: earliest(members.map(m => m.validThrough)),
    ...(home.timezone ? { timezone: home.timezone } : {}),
    sat: members.some(m => m.sat),
    sun: members.some(m => m.sun),
    ...(members.every(m => m.betaOnly) ? { betaOnly: true as const } : {}),
  };
}

export interface ParentAgencyPageData extends AgencyPageData {
  /** The members as the area pages' agency table ("Services"), each with its own routes. */
  services: AgencyGroupData;
}

/**
 * A parent's page: the agency page of its summary, under its own name and path, with its members listed. Members with
 * no regular midday service still count in its numbers and are listed, as on its own agency page (CIV-965).
 */
export function parentAgencyPageData(
  parent: ParentAgency,
  all: readonly AgencyPageSummary[],
  releaseDate: string | null = null,
  area?: Parameters<typeof agencyPageData>[3],
  areaMembers?: readonly AgencyPageSummary[],
): ParentAgencyPageData | null {
  const members = parentMembers(parent, all);
  if (members.length === 0) return null;
  const summary = parentSummary(parent, members);
  const data = agencyPageData(summary, all, releaseDate, area, areaMembers, { title: parent.name, members });
  return { ...data, services: agencyGroupData(members, new Map(all.map(a => [a.slug, a])), releaseDate) };
}

/** Parents with at least one member in this list, in config order. */
export function parentsWithMembers(all: readonly Pick<AgencyPageSummary, 'parentAgency'>[]): ParentAgency[] {
  return PARENT_AGENCIES.filter(p => all.some(a => a.parentAgency === p.slug));
}
