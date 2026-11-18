/**
 * How well a typed route matches a route's number and name (CIV-1864): the one rule the map's route search and the
 * Atlas Studio MCP's route lookup both use. Lower is better; 8 is no match.
 *   0 the number exactly ("504", or "04" for 4)   1 the number starts with it   2 the visible route ID exactly
 *   3 the visible ID starts with it   4 the number contains it   5 the visible ID contains it
 *   6 the name contains it (two letters or more), or "number name" starts with it ("38 Geary", CIV-1048)
 * The route ID counts only where riders see it (no number or name of its own, #1183); the caller passes it only then.
 */
export const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '0';

export interface RouteMatchFields { shortName: string | null | undefined; longName: string | null | undefined; visibleId?: string | null }

export function routeTextMatchRank(r: RouteMatchFields, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 99;
  const qNorm = stripLeadingZeros(q);
  const shortName = (r.shortName ?? '').toLowerCase();
  const shortNorm = stripLeadingZeros(shortName);
  const routeId = (r.visibleId ?? '').toLowerCase();
  const longName = (r.longName ?? '').toLowerCase();
  if (shortName === q || shortNorm === qNorm) return 0;
  if (shortName.startsWith(q) || shortNorm.startsWith(qNorm)) return 1;
  if (routeId === q) return 2;
  if (routeId.startsWith(q)) return 3;
  if (shortName.includes(q) || shortNorm.includes(qNorm)) return 4;
  if (routeId.includes(q)) return 5;
  if (q.length >= 2 && longName.includes(q)) return 6;
  if (shortName && longName && `${shortName} ${longName}`.startsWith(q)) return 6;
  return 8;
}

/** The best match's rank a route list keeps (number, ID or name; 7 and up are not route-text matches). */
export const ROUTE_TEXT_MATCH_MAX = 6;
