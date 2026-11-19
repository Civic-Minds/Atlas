/**
 * One entry per agency or region in History (CIV-1963): a parent agency's feeds (MTA New York's subway, borough buses
 * and MTA Bus) open as one agency. Each feed keeps its own History data and shapes file; this merges them when read.
 *
 * A route key in two feeds is one route: for each year the snapshot read latest (refDate, else period key) wins, so a
 * route that moved between feeds (Queens buses to MTA Bus) keeps one continuous row. Every snapshot remembers its feed
 * (`memberSlug`), so its line, mode and labels are read from that feed.
 */
import { groupAgencies, groupHome, type AgencyGroup } from '../../shared/agencyGroups';

interface SnapshotLike { year: number; periodKey?: string; v2?: { refDate?: string }; memberSlug?: string }
interface RouteLike<S extends SnapshotLike> { routeShortName: string; snapshots: S[]; memberSlug?: string }
interface AgencyLike<R> { slug: string; name: string; region: string; center?: [number, number]; coverageYears?: number[]; routes: R[] }

const readAt = (s: SnapshotLike): string => s.v2?.refDate ?? s.periodKey ?? '';

/** The members' History as one agency under the parent's slug and name, placed where its home feed is. */
export function mergeHistoryAgencies<S extends SnapshotLike, R extends RouteLike<S>, A extends AgencyLike<R>>(
  group: AgencyGroup<A>,
): A {
  if (!group.parent) return group.members[0];
  const home = groupHome(group);
  const routes = new Map<string, R>();
  for (const m of group.members) {
    for (const r of m.routes) {
      const tagged = r.snapshots.map(s => ({ ...s, memberSlug: s.memberSlug ?? m.slug }));
      const had = routes.get(r.routeShortName);
      if (!had) { routes.set(r.routeShortName, { ...r, memberSlug: r.memberSlug ?? m.slug, snapshots: tagged }); continue; }
      const byYear = new Map(had.snapshots.map(s => [s.year, s]));
      for (const s of tagged) {
        const cur = byYear.get(s.year);
        if (!cur || readAt(s) > readAt(cur)) byYear.set(s.year, s);
      }
      const snapshots = [...byYear.values()].sort((a, b) => a.year - b.year);
      routes.set(r.routeShortName, { ...had, snapshots, memberSlug: snapshots.at(-1)?.memberSlug ?? had.memberSlug });
    }
  }
  const years = [...new Set(group.members.flatMap(m => m.coverageYears ?? []))].sort((a, b) => a - b);
  return {
    ...home,
    slug: group.slug,
    name: group.parent.name,
    ...(years.length ? { coverageYears: years } : {}),
    routes: [...routes.values()],
  };
}

/** History's agencies as entries: each parent's feeds merged into one (catalog gives each feed's parent). */
export function groupHistoryAgencies<S extends SnapshotLike, R extends RouteLike<S>, A extends AgencyLike<R>>(
  agencies: readonly A[],
  parentOf: (slug: string) => string | undefined,
): Array<{ agency: A; members: string[] }> {
  return groupAgencies(agencies.map(a => ({ slug: a.slug, parentAgency: parentOf(a.slug), a })))
    .map(g => {
      const members = g.members.map(x => x.a);
      return { agency: mergeHistoryAgencies({ ...g, members } as AgencyGroup<A>), members: members.map(m => m.slug) };
    });
}
