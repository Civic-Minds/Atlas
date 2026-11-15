/**
 * Per-period values of a route for History: the worst direction across its features, read as the
 * map reads them (the no-service sentinel = null). Shared by the weekday rep and the weekend days
 * (CIV-1425), in its own file so historyV2 and historyWeekend can both use it without an import cycle.
 */
import type { HeadwayByPeriod, PeriodKey } from '../shared/config.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../shared/pmtilesProps.js';

type Props = Record<string, unknown>;

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v < NO_PERIOD_SERVICE_TILE_VALUE ? v : null;
}

export function periodsOf(features: Props[]): HeadwayByPeriod | undefined {
  const out: Partial<Record<PeriodKey, number | null>> = {};
  let any = false;
  for (const f of features) {
    const src = (f.routeFilterHeadwayByPeriod ?? f.worstDirectionHeadwayByPeriod) as Record<string, unknown> | undefined;
    if (!src) continue;
    for (const [k, raw] of Object.entries(src)) {
      const v = finiteOrNull(raw);
      const cur = out[k as PeriodKey];
      // worst direction: keep the larger value across features
      if (cur === undefined || (v != null && (cur == null || v > cur))) out[k as PeriodKey] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}
