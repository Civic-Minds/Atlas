/**
 * Core of the headway-filter consistency audit (owner rule: a route passes "every N min or
 * less" for a period only if every direction meets N; worst direction decides).
 *
 * For every route feature, period and UI threshold it compares:
 *  - the app's in-memory decision (passesRouteFilter, after the same client-side normalization
 *    the app applies when it loads agency JSON), and
 *  - the PMTiles map decision: the real MapLibre filter expression, evaluated by MapLibre's own
 *    style-spec evaluator against the properties the tile build would write.
 *
 * It also checks the owner's rule independently of the stamped worst-direction fields: from each
 * direction's own per-feature values it derives that direction's sustained headway, and flags any
 * route that passes N while some direction's sustained value is above N.
 */
import { featureFilter } from '@maplibre/maplibre-gl-style-spec';
import { HEADWAY_TIERS, PERIOD_KEYS, type PeriodKey } from '../shared/config';
import { buildTileHeadwayFilterClause } from '../shared/tileFilterExprs';
import { normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter';
import { prepareAgencyRouteFeaturesForTiles } from '../pipeline/prepareAgencyRoutesForTiles';
import { passesRouteFilter, type ShapeProperties } from '../src/hooks/useIntervalStats';

export type AuditPeriod = 'all' | PeriodKey;
export const AUDIT_PERIODS: AuditPeriod[] = ['all', ...PERIOD_KEYS];
/** Every threshold the Frequency control offers (including "Infrequent" = Infinity). */
export const AUDIT_THRESHOLDS: number[] = HEADWAY_TIERS.map(t => t.max);

type Feature = { type?: string; geometry: { type: string; coordinates?: unknown } | null; properties: Record<string, any> | null };

export const AUDIT_KINDS = [
  /** One direction/branch feature: app and map decide differently. */
  'feature-disagree',
  /** Route passes in the app (counts, lists) but the map hides it. */
  'route-app-only',
  /** Map draws the route but the app says it fails. */
  'route-map-only',
  /** App passes the route while some direction's own sustained headway is above N. */
  'app-passes-slow-direction',
  /** Map passes the route while some direction's own sustained headway is above N. */
  'map-passes-slow-direction',
] as const;
export type AuditKind = typeof AUDIT_KINDS[number];

export interface AuditMismatch {
  agency: string;
  /** agency::routeId[::branch:x] — the identity the app counts as one route. */
  routeKey: string;
  route: string;
  day: string;
  period: AuditPeriod;
  maxHeadway: number;
  kind: AuditKind;
  detail: string;
}

export interface AuditResult {
  routes: number;
  checks: number;
  mismatches: AuditMismatch[];
  /** Distinct route-days (routeKey::day) with at least one mismatch, per kind. */
  routesByKind: Record<AuditMismatch['kind'], Set<string>>;
  /** Distinct routes (routeKey, any day) with at least one mismatch, per kind. */
  distinctRoutesByKind: Record<AuditMismatch['kind'], Set<string>>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** MVT has no null and no nested objects: tippecanoe drops nulls and stringifies objects. */
function asTileProperties(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (typeof value === 'object') continue;
    out[key] = value;
  }
  return out;
}

const filterCache = new Map<string, ReturnType<typeof featureFilter>>();
function tileFilterFor(period: AuditPeriod, maxHeadway: number) {
  const key = `${period}|${maxHeadway}`;
  let compiled = filterCache.get(key);
  if (!compiled) {
    // Mirrors useIntervalStats' tileFilter: no headway clause at all for All day + All.
    const clause = maxHeadway === Infinity && period === 'all'
      ? ['literal', true]
      : buildTileHeadwayFilterClause(period, maxHeadway);
    compiled = featureFilter(clause as any, "layers[0].filter");
    filterCache.set(key, compiled);
  }
  return compiled;
}

function isRouteLine(f: Feature): boolean {
  return !!f.properties?.routeId && f.geometry?.type === 'LineString' && !f.properties.stopId;
}

function routeKeyOf(agency: string, p: Record<string, any>): string {
  return `${agency}::${p.routeId}${p.routeBranch ? `::branch:${p.routeBranch}` : ''}`;
}

/**
 * Independent per-direction sustained headway (does not read the stamped worst-direction
 * fields). Period: the slowest real (sustained, non-span) destination in that direction,
 * ignoring infrequent-tier siblings when a sustained regular pattern runs in the period.
 * All day: the slowest regular-tier destination (infrequent siblings dropped when a regular
 * pattern exists). Returns undefined when that direction has no such value.
 */
function directionSustainedValue(features: Record<string, any>[], period: AuditPeriod): number | undefined {
  if (period === 'all') {
    const pool = features.filter(p => p.tier !== 'span' && p.headway != null);
    const regular = pool.filter(p => p.tier !== 'infrequent');
    const use = regular.length > 0 ? regular : pool;
    return use.length ? Math.max(...use.map(p => p.headway as number)) : undefined;
  }
  // Occasional short-turn / extension patterns (tier infrequent) do not count against a direction
  // whose regular pattern runs in this period (TransLink 99's AM Boundary Loop trips).
  const sustained = features.filter(p => p.tier !== 'span' && typeof p.headwayByPeriod?.[period] === 'number'
    && p.headwayByPeriodSustained?.[period] !== false);
  const regular = sustained.filter(p => p.tier !== 'infrequent');
  const values = (regular.length > 0 ? regular : sustained)
    .map(p => p.headwayByPeriod?.[period])
    .filter((v): v is number => typeof v === 'number');
  return values.length ? Math.max(...values) : undefined;
}

export function auditAgencyFeatures(agency: string, rawFeatures: Feature[]): AuditResult {
  // In-memory copy: what the app holds after loading agency JSON.
  const clientFeatures = clone(rawFeatures);
  normalizeRouteFilterFeatures(clientFeatures as any);
  // Tile copy: what build-pmtiles writes for the same features.
  const tileSource = clone(rawFeatures);
  prepareAgencyRouteFeaturesForTiles(tileSource as any, agency);

  const result: AuditResult = {
    routes: 0,
    checks: 0,
    mismatches: [],
    routesByKind: Object.fromEntries(AUDIT_KINDS.map(kind => [kind, new Set<string>()])) as AuditResult['routesByKind'],
    distinctRoutesByKind: Object.fromEntries(AUDIT_KINDS.map(kind => [kind, new Set<string>()])) as AuditResult['distinctRoutesByKind'],
  };
  const record = (m: AuditMismatch) => {
    result.mismatches.push(m);
    result.routesByKind[m.kind].add(`${m.routeKey}::${m.day}`);
    result.distinctRoutesByKind[m.kind].add(m.routeKey);
  };

  // Group by route + branch + day (the unit the app counts as "a route").
  const groups = new Map<string, Array<{ client: Record<string, any>; tile: Record<string, unknown> }>>();
  for (let i = 0; i < rawFeatures.length; i++) {
    const raw = rawFeatures[i];
    if (!isRouteLine(raw)) continue;
    const client = clientFeatures[i].properties as Record<string, any>;
    const tile = asTileProperties(tileSource[i].properties as Record<string, unknown>);
    const key = `${routeKeyOf(agency, client)}::${client.day ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push({ client, tile });
    groups.set(key, group);
  }
  result.routes = groups.size;

  const baseFilters = { agencies: new Set<string>(), modes: new Set<number>() };
  for (const group of groups.values()) {
    const sample = group[0].client;
    const routeLabel = String(sample.routeShortName || sample.routeId);
    const routeKey = routeKeyOf(agency, sample);
    const day = String(sample.day ?? '');
    const directions = new Map<number, Record<string, any>[]>();
    for (const { client } of group) {
      const d = Number(client.directionId ?? 0);
      directions.set(d, [...(directions.get(d) ?? []), client]);
    }

    for (const period of AUDIT_PERIODS) {
      const directionValues = [...directions.entries()].map(([dir, feats]) => [dir, directionSustainedValue(feats, period)] as const);
      for (const maxHeadway of AUDIT_THRESHOLDS) {
        const filters = { ...baseFilters, maxHeadway, day: sample.day ?? 'Weekday', period };
        let anyClient = false;
        let anyTile = false;
        for (const { client, tile } of group) {
          result.checks++;
          const inMemory = passesRouteFilter(client as ShapeProperties, agency, filters, null);
          const onMap = tileFilterFor(period, maxHeadway).filter({ zoom: 14 } as any, { type: 2, properties: tile } as any);
          anyClient ||= inMemory;
          anyTile ||= onMap;
          if (inMemory !== onMap) {
            record({
              agency, routeKey, route: routeLabel, day, period, maxHeadway, kind: 'feature-disagree',
              detail: `dir ${client.directionId} "${client.headsign ?? ''}": app=${inMemory} map=${onMap}`,
            });
          }
        }
        if (anyClient !== anyTile) {
          record({ agency, routeKey, route: routeLabel, day, period, maxHeadway, kind: anyClient ? 'route-app-only' : 'route-map-only', detail: `app=${anyClient} map=${anyTile}` });
        }
        if ((anyClient || anyTile) && maxHeadway !== Infinity) {
          const over = directionValues.filter(([, v]) => v != null && v > maxHeadway);
          if (over.length > 0) {
            const detail = `passes (app=${anyClient} map=${anyTile}) but ${over.map(([d, v]) => `dir ${d}=${v}`).join(', ')}`;
            if (anyClient) record({ agency, routeKey, route: routeLabel, day, period, maxHeadway, kind: 'app-passes-slow-direction', detail });
            if (anyTile) record({ agency, routeKey, route: routeLabel, day, period, maxHeadway, kind: 'map-passes-slow-direction', detail });
          }
        }
      }
    }
  }
  return result;
}
