/**
 * Route-level values for the catalog-scan report: for every route, day and period, what the map's
 * frequency filter reads (the worst-direction value `wdph`, the full-window wait `wdpch`, the
 * filter's own value) and whether the route passes "every N min" at 10/15/20/30/60; plus Night
 * 30/60 for each route direction. Pure: the filter rule is passed in, so a scan reads it from the
 * checkout being judged (see route-values.mts). Compare two outputs with report.py route-values.
 */

export const THRESHOLDS = [10, 15, 20, 30, 60] as const;
export const PERIODS = ['all', 'amPeak', 'midday', 'pmPeak', 'evening', 'late', 'overnight'] as const;
export type RoutePeriod = (typeof PERIODS)[number];

export interface FilterRules {
  routeFilterHeadway(props: object, period: RoutePeriod): number | null;
  featurePassesHeadwayFilter(props: object, period: RoutePeriod | undefined, maxHeadway: number): boolean;
}

export interface PeriodValue {
  /** The route's worst-direction headway as stamped on its features (null when none). */
  wdph: number | null;
  /** The worst-direction full-window wait for the period (null when the period has none). */
  wdpch: number | null;
  /** What the filter compares: the lowest filter value among the route's features. */
  value: number | null;
  /** Thresholds the route passes (some feature passes, as the map draws it). */
  pass: number[];
  /** True when the route's features disagree on `value` (the stamp should make them equal). */
  mixed?: boolean;
}

export interface RouteDayValues {
  short: string | null;
  long: string | null;
  features: number;
  periods: Record<string, PeriodValue>;
  /** Night 30/60 per direction: some pattern of that direction carries the flag. */
  night: { dirs: Record<string, { n30: boolean; n60: boolean }>; route30: boolean; route60: boolean };
}

type Props = Record<string, any>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function extractRouteValues(features: ReadonlyArray<{ geometry?: { type?: string } | null; properties?: Props | null }>, rules: FilterRules): Record<string, RouteDayValues> {
  const groups = new Map<string, Props[]>();
  for (const f of features) {
    const p = f.properties;
    if (!p || p.stopId != null || p.routeId == null || !p.day) continue; // route lines only
    const key = `${p.routeId}|${p.routeBranch ?? ''}|${p.day}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
  }
  const out: Record<string, RouteDayValues> = {};
  for (const [key, props] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const periods: Record<string, PeriodValue> = {};
    for (const period of PERIODS) {
      const values = props.map(p => rules.routeFilterHeadway(p, period)).filter((v): v is number => v != null);
      const wdph = period === 'all'
        ? props.map(p => num(p.worstDirectionHeadway)).find(v => v != null) ?? null
        : props.map(p => num(p.worstDirectionHeadwayByPeriod?.[period])).find(v => v != null) ?? null;
      const wdpch = period === 'all'
        ? null
        : props.map(p => num(p.worstDirectionPeriodCoverageHeadway?.[period])).find(v => v != null) ?? null;
      const pv: PeriodValue = {
        wdph,
        wdpch,
        value: values.length ? Math.min(...values) : null,
        pass: THRESHOLDS.filter(n => props.some(p => rules.featurePassesHeadwayFilter(p, period, n))),
      };
      if (new Set(values).size > 1) pv.mixed = true;
      periods[period] = pv;
    }
    const dirs: Record<string, { n30: boolean; n60: boolean }> = {};
    for (const p of props) {
      const d = String(p.directionId ?? 'none');
      const cur = dirs[d] ?? (dirs[d] = { n30: false, n60: false });
      if (p.nightService30 === true) cur.n30 = true;
      if (p.nightService60 === true || p.nightService === true) cur.n60 = true;
    }
    const judged = Object.entries(dirs).filter(([d]) => d !== 'none');
    const list = (judged.length ? judged : Object.entries(dirs)).map(([, v]) => v);
    out[key] = {
      short: props[0].routeShortName ?? null,
      long: props[0].routeLongName ?? null,
      features: props.length,
      periods,
      night: { dirs, route30: list.length > 0 && list.every(v => v.n30), route60: list.length > 0 && list.every(v => v.n60) },
    };
  }
  return out;
}
