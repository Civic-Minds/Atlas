/**
 * One entry per agency or region, everywhere (docs/product/DECISIONS.md). An agency split across feeds (MTA New York's
 * subway, borough buses and railroads; exo's sectors) stays one agency per feed in the data; every screen and tool that
 * lists, counts, ranks or compares agencies groups them here first, so its members show as one entry under the parent.
 * The grouping itself is this one function: no screen builds its own (a guard test checks).
 *
 * Imports only the parent list, so the map bundle, the pages and the MCP tools can all use it.
 */
import { parentAgency, type ParentAgency } from './parentAgencyList';

export interface AgencyGroup<T> {
  /** The parent's slug for a parent, else the agency's own slug. */
  slug: string;
  /** Set when this entry stands for a parent agency. */
  parent?: ParentAgency;
  /** The feeds it stands for, in input order: one for an agency with no parent. */
  members: T[];
}

/**
 * The agencies as entries: a parent's members (named by `parentAgency`, listed in config/parent-agencies.json) become one
 * entry at the position of its first member; every other agency is its own entry. Input order is kept otherwise.
 */
export function groupAgencies<T extends { slug: string; parentAgency?: string | null }>(agencies: readonly T[]): AgencyGroup<T>[] {
  const out: AgencyGroup<T>[] = [];
  const byParent = new Map<string, AgencyGroup<T>>();
  for (const a of agencies) {
    const parent = parentAgency(a.parentAgency ?? undefined);
    if (!parent) { out.push({ slug: a.slug, members: [a] }); continue; }
    const had = byParent.get(parent.slug);
    if (had) { had.members.push(a); continue; }
    const g: AgencyGroup<T> = { slug: parent.slug, parent, members: [a] };
    byParent.set(parent.slug, g);
    out.push(g);
  }
  return out;
}

/** The feed an entry takes its place and card from: the member on the parent's own slug (exo's trains), else its first. */
export function groupHome<T extends { slug: string }>(g: AgencyGroup<T>): T {
  return g.members.find(m => m.slug === g.slug) ?? g.members[0];
}

/** The entry's name: the parent's for a parent, else the agency's own (by `nameOf`). */
export function agencyGroupName<T>(g: AgencyGroup<T>, nameOf: (a: T) => string): string {
  return g.parent ? g.parent.name : nameOf(g.members[0]);
}

/** The name one agency shows under in a list of entries: its parent's when it has one, else `own`. */
export function agencyEntryName(a: { parentAgency?: string | null }, own: string): string {
  return parentAgency(a.parentAgency ?? undefined)?.name ?? own;
}

/** How many entries these agencies show as: a parent once. */
export function agencyEntryCount(agencies: readonly { slug: string; parentAgency?: string | null }[]): number {
  return groupAgencies(agencies).length;
}
