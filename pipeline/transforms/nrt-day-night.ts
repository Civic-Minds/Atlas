import type { GtfsData, GtfsRoute } from '../../types/gtfs';
import { auditNrtMergedPairShapes, type NrtMergedPair } from './nrt-shape-audit.js';

export interface NrtDayNightMergeResult {
  mergedPairs: Array<{ dayShort: string; eveShort: string; longName: string }>;
  tripsReassigned: number;
  shortTurnTripsDropped: number;
  orphanEveRoutes: string[];
  shapeWarnings: string[];
}

export interface NrtCleanupResult {
  shortTurnTripsDropped: number;
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
    const cleaned = removeNrtShortTurnArtifacts(gtfs);
    return {
      gtfs: cleaned.gtfs,
      result: {
        mergedPairs: pairsForAudit.map(({ dayShort, eveShort, longName }) => ({ dayShort, eveShort, longName })),
        tripsReassigned: 0,
        shortTurnTripsDropped: cleaned.dropped,
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

  const cleaned = removeNrtShortTurnArtifacts({
    ...gtfs,
    routes: routes.filter(r => !removedRouteIds.has(r.route_id)),
    trips,
  });

  return {
    gtfs: cleaned.gtfs,
    result: {
      mergedPairs: pairsForAudit.map(({ dayShort, eveShort, longName }) => ({ dayShort, eveShort, longName })),
      tripsReassigned,
      shortTurnTripsDropped: cleaned.dropped,
      orphanEveRoutes,
      shapeWarnings,
    },
  };
}

/**
 * NRT's 209/216 feed includes two- and three-stop auxiliary patterns marked as
 * normal passenger trips. They are not the published route service and make
 * the full route appear to run every 1–5 minutes at shared stops.
 */
function removeNrtShortTurnArtifacts(gtfs: GtfsData): { gtfs: GtfsData; dropped: number } {
  const nrtRouteIds = new Set(
    gtfs.routes
      .filter(route => route.route_short_name === '209' || route.route_short_name === '216')
      .map(route => route.route_id),
  );
  if (nrtRouteIds.size === 0) return { gtfs, dropped: 0 };

  const stopCountByTrip = new Map<string, number>();
  for (const stopTime of gtfs.stopTimes) {
    stopCountByTrip.set(stopTime.trip_id, (stopCountByTrip.get(stopTime.trip_id) ?? 0) + 1);
  }
  const droppedTripIds = new Set(
    gtfs.trips
      .filter(trip => nrtRouteIds.has(trip.route_id) && (stopCountByTrip.get(trip.trip_id) ?? 0) <= 3)
      .map(trip => trip.trip_id),
  );
  if (droppedTripIds.size === 0) return { gtfs, dropped: 0 };

  return {
    gtfs: {
      ...gtfs,
      trips: gtfs.trips.filter(trip => !droppedTripIds.has(trip.trip_id)),
      stopTimes: gtfs.stopTimes.filter(stopTime => !droppedTripIds.has(stopTime.trip_id)),
      frequencies: gtfs.frequencies?.filter(freq => !droppedTripIds.has(freq.trip_id)),
    },
    dropped: droppedTripIds.size,
  };
}

/**
 * NRT 301 westbound: a real short-turn pattern is labeled with a headsign copy-pasted
 * from the full Port Dalhousie route, missing one space ("HOSPITAL -PORT DALHOUSIE" vs
 * the real pattern's "HOSPITAL - PORT DALHOUSIE"). These trips genuinely run, but
 * terminate at the Hospital, never reaching Port Dalhousie — unlike the 209/216
 * artifacts above, this is real service, so we clear the bad headsign rather than drop
 * the trips, falling back to the existing last-stop-derived headsign used for any feed
 * that omits trip_headsign entirely (#242).
 */
function relabelNrt301MislabeledShortTurn(gtfs: GtfsData): { gtfs: GtfsData; relabeled: number } {
  const route301 = gtfs.routes.find(route => route.route_short_name === '301');
  if (!route301) return { gtfs, relabeled: 0 };

  const BAD_HEADSIGN = 'HOSPITAL -PORT DALHOUSIE'; // missing space before "PORT" — the defect signature
  const candidateTripIds = new Set(
    gtfs.trips
      .filter(trip => trip.route_id === route301.route_id && trip.trip_headsign?.trim() === BAD_HEADSIGN)
      .map(trip => trip.trip_id),
  );
  if (candidateTripIds.size === 0) return { gtfs, relabeled: 0 };

  const lastStopByTrip = new Map<string, { stopId: string; seq: number }>();
  for (const st of gtfs.stopTimes) {
    if (!candidateTripIds.has(st.trip_id)) continue;
    const seq = parseInt(st.stop_sequence, 10);
    const existing = lastStopByTrip.get(st.trip_id);
    if (!existing || seq > existing.seq) lastStopByTrip.set(st.trip_id, { stopId: st.stop_id, seq });
  }
  const stopNameById = new Map(gtfs.stops.map(stop => [stop.stop_id, stop.stop_name]));

  const toClear = new Set<string>();
  for (const tripId of candidateTripIds) {
    const last = lastStopByTrip.get(tripId);
    const name = last ? stopNameById.get(last.stopId) : undefined;
    if (!name) continue;
    // If a trip's actual last stop really is Port Dalhousie, the headsign wasn't
    // mislabeled after all (e.g. a future feed fix) — leave it alone.
    if (/port dalhousie/i.test(name)) continue;
    toClear.add(tripId);
  }
  if (toClear.size === 0) return { gtfs, relabeled: 0 };

  return {
    gtfs: {
      ...gtfs,
      trips: gtfs.trips.map(trip => toClear.has(trip.trip_id) ? { ...trip, trip_headsign: undefined } : trip),
    },
    relabeled: toClear.size,
  };
}

/** Keep NRT's published day/night route numbers separate while removing known bad auxiliary trips. */
export function sanitizeNrtFeed(gtfs: GtfsData): { gtfs: GtfsData; result: NrtCleanupResult } {
  const cleaned = removeNrtShortTurnArtifacts(gtfs);
  const relabeledResult = relabelNrt301MislabeledShortTurn(cleaned.gtfs);
  return {
    gtfs: relabeledResult.gtfs,
    result: { shortTurnTripsDropped: cleaned.dropped },
  };
}
