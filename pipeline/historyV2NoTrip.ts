/**
 * CIV-1850: plan the CIV-471 no-trips flag for one published History v2 sidecar. Pure: no R2, no feed reading.
 *
 * Given the published body and the flags a pinned read of that period's feed produced per route key
 * (historyNoTripPeriods), add noTripPeriods to the routes that have one, and nothing else:
 * - a route the read does not know, or with nothing flagged, is left as it is;
 * - truth guard: a flag on a period the published route shows a number for (rep.p or rep.tp) means the read and the
 *   published sidecar disagree, so the whole period is skipped (manager-approved, 2026-11-18);
 * - the result passes checkNoTripAddition (mode 'add-noTripPeriods') against the published body by construction.
 */
import type { PeriodKey } from '../shared/config.js';
import { checkNoTripAddition } from './historyV2Replace.js';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const blank = (v: unknown) => v === null || v === undefined;

export type SidecarNoTripPlan =
  | { kind: 'add'; body: string; routes: number; byPeriod: Partial<Record<PeriodKey, number>> }
  | { kind: 'skip'; reason: string }
  | { kind: 'disagree'; routes: Array<{ route: string; periods: PeriodKey[] }> };

export function planSidecarNoTrip(publishedBody: string, flags: Readonly<Record<string, readonly PeriodKey[]>>): SidecarNoTripPlan {
  const out = JSON.parse(publishedBody) as Obj;
  if (!isObj(out.routes)) return { kind: 'skip', reason: 'not a sidecar (no routes object)' };
  if (JSON.stringify(out) !== publishedBody) return { kind: 'skip', reason: 'published sidecar is not compact JSON' };
  const routes = out.routes as Obj;
  if (Object.values(routes).some(r => isObj(r) && r.noTripPeriods !== undefined)) return { kind: 'skip', reason: 'already records noTripPeriods' };

  const disagree: Array<{ route: string; periods: PeriodKey[] }> = [];
  const byPeriod: Partial<Record<PeriodKey, number>> = {};
  let added = 0;
  for (const [route, rec] of Object.entries(routes)) {
    const list = flags[route];
    if (!isObj(rec) || !list || list.length === 0) continue;
    const rep = isObj(rec.rep) ? rec.rep : {};
    const p = isObj(rep.p) ? rep.p : {};
    const tp = isObj(rep.tp) ? rep.tp : {};
    const valued = list.filter(k => !blank(p[k]) || !blank(tp[k]));
    if (valued.length) { disagree.push({ route, periods: valued }); continue; }
    rec.noTripPeriods = [...list];
    added++;
    for (const k of list) byPeriod[k] = (byPeriod[k] ?? 0) + 1;
  }
  if (disagree.length) return { kind: 'disagree', routes: disagree };
  if (added === 0) return { kind: 'skip', reason: 'no route flagged' };
  const body = JSON.stringify(out);
  const check = checkNoTripAddition(publishedBody, body);
  if (!check.ok) throw new Error(`internal: planned sidecar fails the add-only check: ${check.reason}`);
  return { kind: 'add', body, routes: added, byPeriod };
}

/**
 * For a sidecar with no feed hash: the read's route keys must equal the published ones (supplemental-feed routes
 * excluded, since the read is the main feed only). Returns the first few differences, empty when equal.
 */
export function routeKeyMismatch(published: Obj, readKeys: ReadonlySet<string>): string[] {
  const routes = isObj(published.routes) ? Object.keys(published.routes) : [];
  const supp = new Set(Object.values(isObj(published.supplementalRoutes) ? published.supplementalRoutes : {}).flatMap(v => (Array.isArray(v) ? v.map(String) : [])));
  const pub = new Set(routes.filter(k => !supp.has(k)));
  const out: string[] = [];
  for (const k of pub) if (!readKeys.has(k)) out.push(`-${k}`);
  for (const k of readKeys) if (!pub.has(k) && !supp.has(k)) out.push(`+${k}`);
  return out.slice(0, 6);
}
