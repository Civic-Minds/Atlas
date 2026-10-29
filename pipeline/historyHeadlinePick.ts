/**
 * Which Weekday direction-0 feature speaks for a route in a v1 History snapshot (CIV-1081). The writers keep the one
 * with the smallest headway and store its period values. A short-turn pattern can win that and carry no period value
 * at all (Brampton 1 "Downtown Terminal": headline 27, every period null, beside Queen East's 29 with midday 29), which
 * blanked the route's periods in History. A feature with period values now beats one with none; otherwise the
 * smallest headway still wins, so only routes whose pick had no period value change. The swap never lowers the
 * headline: the old pick won on the smaller headway, so the feature that replaces it has the same or a larger one.
 */
import type { HeadwayByPeriod } from '../shared/config.js';

const hasPeriodValue = (byp: HeadwayByPeriod | null | undefined): boolean =>
  !!byp && Object.values(byp).some(v => typeof v === 'number' && Number.isFinite(v));

export function historyHeadlineWins(
  candidate: { headway: number; headwayByPeriod?: HeadwayByPeriod | null },
  incumbent: { headway: number; headwayByPeriod?: HeadwayByPeriod | null } | undefined,
): boolean {
  if (!incumbent) return true;
  const c = hasPeriodValue(candidate.headwayByPeriod);
  const i = hasPeriodValue(incumbent.headwayByPeriod);
  if (c !== i) return c;
  return candidate.headway < incumbent.headway;
}
