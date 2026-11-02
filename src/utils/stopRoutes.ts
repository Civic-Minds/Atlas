import type { GeoJSON } from 'geojson';
import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { branchDisplayPeriodHeadway, buildRouteFacts, buildRouteStopMetric, metricValueForPeriod, type HeadwayMetric, type RouteLabel } from './routeFacts';
import { buildSharedStopIndex } from '../../shared/sharedStops';
import { partPeriodText, periodEdgeText } from './effectiveHeadway';
import { routeCardSharedStretchEdge } from './routeCardRows';
import { hasRegularServiceInPeriod } from './stretchCard';
import { agencyNames } from './agencyName';
import { rowTrips } from './rowTrips';
import { compareRouteNumber } from './sortCompare';
import { noTripsInPeriod } from '../../shared/stopRoutePeriods';
import { routeCardNoNumberWords } from './routeCardNotices';
import type { DayType } from '../../shared/dayTypes';
import type { PeriodKey } from '../../shared/config';

/**
 * The stop card's routes and destination rows, and the rule for the frequency each row shows (CIV-997). One
 * place, with tests, so the stop card never states a destination as more frequent than it is (CIV-918).
 */

export interface StopBranch {
  rKey: string;
  headsign: string | null;
  /** The route's departures at the stop, pooled across its patterns where they share it (CIV-82). */
  service: HeadwayMetric;
  /** The branch's own value for the period, as its route card row shows it (CIV-918). */
  rowHeadway?: number | null;
  directionId: number;
  /** #934: part-period wording shown in place of a number, as on the route card's row. */
  periodText?: string;
  /**
   * CIV-1251 row 8: where the stop is on the direction's shared stretch (two or more of its destinations serve it) and that
   * stretch starts late or ends early, its own words and spacing for the stop card's Shared stretch row, as the route card.
   */
  sharedEdge?: { text: string; every: number };
}

export interface StopRoute {
  shortName: string;
  /** What the row shows (route facts' label, CIV-984); the short name is only the route's identity. */
  label: RouteLabel;
  longName: string;
  agencyName: string;
  agencySlug?: string;
  routeType?: number;
  branches: StopBranch[];
  /**
   * CIV-1052: the route serves this stop but the schedule proves it has no trips here in the whole period
   * (its stop points' routePeriodBits). It has no branches; the card lists it with "No trips from {range}".
   */
  noTrips?: { rKey: string };
  /**
   * #1278: the route has trips at this stop in the period (its routePeriodBits) but no stop row, since it has no number
   * there (#750). It has no branches; the card lists it with the route card's own words (routeCardNoNumberWords).
   */
  noNumber?: { rKey: string; text: string };
}

/**
 * The route's headline, standing in where the stop has no all-day value of its own. CIV-1204: none where the headline's
 * window has no regular cadence (the route card's verdict), so it never reads as "every N".
 */
export function headlineStandIn(p: Pick<ShapeProperties, 'headway' | 'headlineNoRegular'>): number | null {
  return p.headlineNoRegular ? null : p.headway ?? null;
}

/** The stop's own value for a branch in the period: every trip of the direction at the stop, pooled where patterns share it. */
export function stopBranchHeadway(branch: StopBranch, period: TimePeriod): number | null {
  return metricValueForPeriod(branch.service, period);
}

/**
 * The value a destination row shows: the less frequent of the branch's own value and the stop's value. The
 * stop's value counts every trip of the direction (504A and 504B together at King and Bay) and the branch's
 * route-wide value can count trips that don't reach this stop, so taking the larger never overstates.
 * A part-period row shows words instead (null).
 */
export function stopRowHeadway(branch: StopBranch, period: TimePeriod): number | null {
  if (branch.periodText) return null;
  const own = branch.rowHeadway ?? null;
  const atStop = stopBranchHeadway(branch, period);
  if (own == null) return atStop;
  if (atStop == null) return own;
  return Math.max(own, atStop);
}

/**
 * The value on a route's own line: the stop's best value, only where it is better than every destination row
 * (the route's patterns share the stop, so the route comes more often than any one destination); else none.
 */
export function stopRouteLineHeadway(branches: readonly StopBranch[], period: TimePeriod): number | null {
  const rows = branches.map(b => stopRowHeadway(b, period)).filter((hw): hw is number => hw != null);
  const pooledValues = branches.map(b => (b.periodText ? null : stopBranchHeadway(b, period))).filter((hw): hw is number => hw != null);
  const pooled = pooledValues.length > 0 ? Math.min(...pooledValues) : null;
  return pooled != null && rows.length > 0 && pooled < Math.min(...rows) ? pooled : null;
}

/** The stop's best value across a route's branches, for ordering the stop card's routes. */
export function stopRouteBestHeadway(branches: readonly StopBranch[], period: TimePeriod): number | null {
  const vals = branches.map(b => stopBranchHeadway(b, period)).filter((h): h is number => h != null);
  return vals.length ? Math.min(...vals) : null;
}

/** Every route that serves the stop (or its siblings) in the day and period, with one branch per direction and destination. */
export function buildStopRoutes({ siblingIdsByAgency, routesByAgency, routePeriodBitsByAgency, layers, day, period }: {
  siblingIdsByAgency: Record<string, Set<string>>;
  routesByAgency: Record<string, Set<string>>;
  /** CIV-1052: each route's routePeriodBits at the stop and its siblings (undefined where a stop has no field). */
  routePeriodBitsByAgency?: Record<string, Map<string, Array<number | undefined>>>;
  layers: Record<string, GeoJSON.FeatureCollection>;
  day: string;
  period: TimePeriod;
}): StopRoute[] {
  type Branch = { rKey: string; headsign: string | null; service: ReturnType<typeof buildRouteStopMetric>; rowHeadway: number | null; directionId: number; periodText?: string; sharedEdge?: { text: string; every: number }; dirKey: string; patterns: number };

  const routeMap = new Map<string, { shortName: string; label: RouteLabel; longName: string; agencyName: string; agencySlug: string; routeType?: number; branches: Map<string, Branch> }>();
  // Pooled values at shared stops (CIV-82), so the stop card agrees with the map and route card.
  const sharedIndexBySlug = new Map(Object.entries(layers).map(([slug, fc]) => [slug, buildSharedStopIndex(fc.features)]));
  // Every destination each route's direction has at the stop in the day, whatever the period (CIV-1080).
  const headsignsAtStop = new Map<string, Set<string>>();
  // CIV-1251 row 8: each route-direction's features for the day, for the route card's own Shared stretch decision.
  const directionFeaturesByKey = new Map<string, ShapeProperties[]>();


  for (const [slug, fc] of Object.entries(layers)) {
    const siblingIds = siblingIdsByAgency[slug] || new Set<string>();
    if (siblingIds.size === 0) continue;

    // Get all routeIds served by any sibling stop in this agency directly from currentStop.routesByAgency
    const routeIds = routesByAgency[slug] || new Set<string>();

    for (const f of fc.features) {
      const p = f.properties as unknown as ShapeProperties;
      if (!p.routeId || !routeIds.has(p.routeId)) continue;
      if (p.day !== undefined && p.day !== day) continue;
      const dirKey = `${slug}::${p.routeId}::${(p as any).directionId ?? 0}`;
      if ((p as any).stopId == null) (directionFeaturesByKey.get(dirKey) ?? directionFeaturesByKey.set(dirKey, []).get(dirKey)!).push(p);
      if ([...siblingIds].some(sId => p.stopHeadways?.[sId] != null)) {
        (headsignsAtStop.get(dirKey) ?? headsignsAtStop.set(dirKey, new Set()).get(dirKey)!).add(p.headsign ?? '');
      }
      // #934: a direction the route only runs on one side of the period shows the route card's
      // words ("every 12 min until 9:37 AM") instead of a cadence, at a stop its shape serves.
      // #1228: only where the route card's row has the words too (rowTrips): a destination with no trips of its own
      // in the period never reads its stretch's "from 5:34 AM" (TTC 100 to Pape, weekday overnight).
      const trips = rowTrips(p, period);
      const periodText = trips.partPeriod != null ? partPeriodText(p, period) : undefined;
      // No cadence at the stop for a period the route card says has no regular cadence (#750), or where the
      // destination has no service of its own and its value is other headsigns' trips (CIV-1069, rowTrips).
      if (!periodText && (!hasRegularServiceInPeriod(p, period) || trips.noOwnService)) continue;

      // Only include features whose shape actually covers any of the sibling stops.
      let stopHw: number | undefined = undefined;
      let matchingStopId: string | undefined = undefined;
      for (const sId of siblingIds) {
        const service = buildRouteStopMetric(p, sId, sharedIndexBySlug.get(slug));
        const hw = metricValueForPeriod(service, period);
        if (hw != null || (periodText && p.stopHeadways?.[sId] != null)) {
          stopHw = hw ?? undefined;
          matchingStopId = sId;
          break; // Use the first matching sibling stop ID that this route serves
        }
      }
      if ((stopHw == null && !periodText) || !matchingStopId) continue;

      const dirId = (p as any).directionId ?? 0;
      const facts = buildRouteFacts(p, slug);
      const routeShortName = facts.shortName;
      if (!routeMap.has(routeShortName)) {
        routeMap.set(routeShortName, {
          shortName: routeShortName,
          label: facts.label,
          longName: facts.longName || '',
          agencyName: agencyNames(facts.agencyName).name,
          agencySlug: slug,
          routeType: facts.routeType,
          branches: new Map(),
        });
      }
      const entry = routeMap.get(routeShortName)!;
      const branchKey = `${dirId}::${p.headsign ?? ''}`;
      // Prefer stop-specific headway over feature headway; keep the best (lowest) when deduping.
      const service = buildRouteStopMetric(p, matchingStopId, sharedIndexBySlug.get(slug));
      const standIn = headlineStandIn(p);
      const newHeadway = service.value ?? standIn;
      const existing = entry.branches.get(branchKey);
      const patterns = (existing?.patterns ?? 0) + 1;
      if (existing) existing.patterns = patterns;
      if (!existing || (newHeadway != null && (existing.service.value == null || newHeadway < existing.service.value))) {
        entry.branches.set(branchKey, {
          rKey: facts.key,
          headsign: p.headsign ?? null,
          service: service.value == null && standIn != null && !periodText
            ? { ...service, value: standIn, provenance: 'all-day-summary' }
            : service,
          // A destination row says how often that destination comes (CIV-918): the branch's own value, the
          // same number its row on the route card shows. The stop's value counts every trip of the
          // direction (504A and 504B together at King and Bay), so it would overstate a destination.
          rowHeadway: branchDisplayPeriodHeadway(p, period),
          directionId: dirId,
          ...(periodText ? { periodText } : {}),
          dirKey,
          patterns,
        });
      }
    }
  }
  // CIV-1251 row 8: the Shared stretch row's time where the route card shows it (routeCardSharedStretchEdge, the card's own
  // decision), at a stop on the shared stretch (two or more of the direction's destinations serve it), so the same time is
  // never on two lines.
  const sharedEdgeByKey = new Map<string, ReturnType<typeof routeCardSharedStretchEdge>>();
  for (const entry of routeMap.values()) {
    for (const b of entry.branches.values()) {
      if (!sharedEdgeByKey.has(b.dirKey)) {
        const features = directionFeaturesByKey.get(b.dirKey) ?? [];
        sharedEdgeByKey.set(b.dirKey, (headsignsAtStop.get(b.dirKey)?.size ?? 0) >= 2 ? routeCardSharedStretchEdge(features, b.directionId, period) : undefined);
      }
      const edge = sharedEdgeByKey.get(b.dirKey);
      if (edge) b.sharedEdge = { text: periodEdgeText(edge), every: edge.every };
    }
  }
  // Two patterns to one destination (TTC 29's two northbound trips to Wilson, from either loop) are one row, and
  // each pattern's own value counts only half its trips (CIV-1080). Where the direction has no other destination at
  // the stop, every trip of the direction there goes to it, so the row is the stop's own pooled value.
  for (const entry of routeMap.values()) {
    for (const b of entry.branches.values()) {
      const only = headsignsAtStop.get(b.dirKey);
      if (b.patterns > 1 && !b.periodText && only?.size === 1 && only.has(b.headsign ?? '')) b.rowHeadway = null;
    }
  }
  // CIV-1052: a route that serves the stop but has no trips here in the whole period is listed with no rows,
  // only where every stop point proves it (a route running part of the period keeps its row and notice).
  const idle = new Map<string, StopRoute>();
  const namedOnDay = new Set<string>();
  if (period !== 'all') {
    for (const [slug, fc] of Object.entries(layers)) {
      const bitsByRoute = routePeriodBitsByAgency?.[slug];
      if (!bitsByRoute) continue;
      const idleIds = new Set([...(routesByAgency[slug] ?? [])]
        .filter(rid => noTripsInPeriod(bitsByRoute.get(rid) ?? [], day as DayType, period as PeriodKey) === true));
      if (idleIds.size === 0) continue;
      for (const f of fc.features) {
        const p = f.properties as unknown as ShapeProperties;
        if ((p as any).stopId != null || !p.routeId || !idleIds.has(p.routeId)) continue;
        const facts = buildRouteFacts(p, slug);
        // The chosen day's feature names the route; another day's stands in when it has none that day.
        if (routeMap.has(facts.shortName) || namedOnDay.has(facts.shortName) || (idle.has(facts.shortName) && p.day !== day)) continue;
        if (p.day === day) namedOnDay.add(facts.shortName);
        idle.set(facts.shortName, {
          shortName: facts.shortName,
          label: facts.label,
          longName: facts.longName || '',
          agencyName: agencyNames(facts.agencyName).name,
          agencySlug: slug,
          routeType: facts.routeType,
          branches: [],
          noTrips: { rKey: facts.key },
        });
      }
    }
  }
  // #1278: the stop's own route with trips here in the period that got no row (#750: no number in the period) is listed
  // with the route card's words for the period, where every stop point proves the trips (TTC 110 Sunday AM, 7:52 first trip).
  const noNumber = new Map<string, StopRoute>();
  if (period !== 'all') {
    for (const [slug, fc] of Object.entries(layers)) {
      const bitsByRoute = routePeriodBitsByAgency?.[slug];
      if (!bitsByRoute) continue;
      for (const rid of routesByAgency[slug] ?? []) {
        if (noTripsInPeriod(bitsByRoute.get(rid) ?? [], day as DayType, period as PeriodKey) !== false) continue;
        const features = fc.features
          .map(f => f.properties as unknown as ShapeProperties)
          .filter(p => (p as any).stopId == null && p.routeId === rid && p.day === day);
        if (features.length === 0) continue;
        const facts = buildRouteFacts(features[0], slug);
        if (routeMap.has(facts.shortName) || idle.has(facts.shortName) || noNumber.has(facts.shortName)) continue;
        const text = routeCardNoNumberWords(features, period);
        if (!text) continue;
        noNumber.set(facts.shortName, {
          shortName: facts.shortName,
          label: facts.label,
          longName: facts.longName || '',
          agencyName: agencyNames(facts.agencyName).name,
          agencySlug: slug,
          routeType: facts.routeType,
          branches: [],
          noNumber: { rKey: facts.key, text },
        });
      }
    }
  }
  return [...Array.from(routeMap.entries())
    .sort(([a], [b]) => compareRouteNumber(a, b))
    .map(([, v]) => ({
      shortName: v.shortName,
      label: v.label,
      longName: v.longName,
      agencyName: v.agencyName,
      agencySlug: v.agencySlug,
      routeType: v.routeType,
      branches: Array.from(v.branches.values())
        .sort((a, b) => a.directionId - b.directionId || (a.service.value ?? Infinity) - (b.service.value ?? Infinity))
        .map(b => ({ rKey: b.rKey, headsign: b.headsign, service: b.service, rowHeadway: b.rowHeadway, directionId: b.directionId, ...(b.periodText ? { periodText: b.periodText } : {}), ...(b.sharedEdge ? { sharedEdge: b.sharedEdge } : {}) })),
    })), ...[...noNumber.values(), ...idle.values()].sort((a, b) => compareRouteNumber(a.shortName, b.shortName))];
}
