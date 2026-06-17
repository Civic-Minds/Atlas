import type { GtfsData, GtfsRoute } from '../../types/gtfs';
import { auditNrtMergedPairShapes, type NrtMergedPair } from './nrt-shape-audit.js';

export interface NrtDayNightMergeResult {
  mergedPairs: Array<{ dayShort: string; eveShort: string; longName: string }>;
  tripsReassigned: number;
  orphanEveRoutes: string[];
  shapeWarnings: string[];
}

function normalizeLongName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** First segment before " - " — NRT often shortens evening long names (e.g. "Oakdale Av." vs "Oakdale Av. - Pen Centre"). */
function corridorKey(name: string | undefined): string {
  const head = normalizeLongName(name).split(' - ')[0];
  return head.replace(/\.$/, '').replace(/\s+av\.?$/, ' av');
}

function corridorKeysMatch(a: string | undefined, b: string | undefined): boolean {
  const ka = corridorKey(a);
  const kb = corridorKey(b);
  if (!ka || !kb) return true;
  if (ka === kb) return true;
  const core = (s: string) => s.replace(/\s+av$/, '');
  const ca = core(ka);
  const cb = core(kb);
  return ca === cb || ca.startsWith(cb) || cb.startsWith(ca);
}

function parseRouteNumber(shortName: string | undefined): number | null {
  const sn = (shortName ?? '').trim();
  if (!/^\d+$/.test(sn)) return null;
  return parseInt(sn, 10);
}

/**
 * Niagara Region Transit uses paired route numbers for the same corridor:
 * 3xx (weekday daytime) and 4xx (evening/weekend). Reassign 4xx trips onto
 * the canonical 3xx route_id so frequency analysis covers the full service day.
 */
export function mergeNrtDayNightRoutes(gtfs: GtfsData): { gtfs: GtfsData; result: NrtDayNightMergeResult } {
  const routes = gtfs.routes ?? [];
  const byShort = new Map<number, GtfsRoute>();
  for (const route of routes) {
    const n = parseRouteNumber(route.route_short_name);
    if (n != null) byShort.set(n, route);
  }

  const eveToDayRouteId = new Map<string, string>();
  const pairsForAudit: NrtMergedPair[] = [];
  const orphanEveRoutes: string[] = [];

  for (const route of routes) {
    const eveNum = parseRouteNumber(route.route_short_name);
    if (eveNum == null || eveNum < 400 || eveNum > 499) continue;

    const dayNum = eveNum - 100;
    const dayRoute = byShort.get(dayNum);
    if (!dayRoute || dayNum < 300 || dayNum > 399) {
      orphanEveRoutes.push(route.route_short_name ?? route.route_id);
      continue;
    }

    if (!corridorKeysMatch(route.route_long_name, dayRoute.route_long_name)) {
      orphanEveRoutes.push(route.route_short_name ?? route.route_id);
      continue;
    }

    eveToDayRouteId.set(route.route_id, dayRoute.route_id);
    pairsForAudit.push({
      dayShort: dayRoute.route_short_name ?? String(dayNum),
      eveShort: route.route_short_name ?? String(eveNum),
      longName: dayRoute.route_long_name ?? route.route_long_name ?? '',
      dayRouteId: dayRoute.route_id,
      eveRouteId: route.route_id,
    });
  }

  const shapeWarnings = pairsForAudit.length > 0 ? auditNrtMergedPairShapes(gtfs, pairsForAudit) : [];

  if (eveToDayRouteId.size === 0) {
    return {
      gtfs,
      result: {
        mergedPairs: pairsForAudit.map(({ dayShort, eveShort, longName }) => ({ dayShort, eveShort, longName })),
        tripsReassigned: 0,
        orphanEveRoutes,
        shapeWarnings,
      },
    };
  }

  const removedRouteIds = new Set(eveToDayRouteId.keys());
  let tripsReassigned = 0;

  const trips = (gtfs.trips ?? []).map(trip => {
    const target = eveToDayRouteId.get(trip.route_id);
    if (!target) return trip;
    tripsReassigned++;
    return { ...trip, route_id: target };
  });

  return {
    gtfs: {
      ...gtfs,
      routes: routes.filter(r => !removedRouteIds.has(r.route_id)),
      trips,
    },
    result: {
      mergedPairs: pairsForAudit.map(({ dayShort, eveShort, longName }) => ({ dayShort, eveShort, longName })),
      tripsReassigned,
      orphanEveRoutes,
      shapeWarnings,
    },
  };
}
