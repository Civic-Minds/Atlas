import { useMemo } from 'react';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveFeeds } from '../../hooks/useLiveFeeds';
import { getNowPeriodForTimezone } from '../../components/Interval/FilterChips';
import { liveFollowsRoute } from '../../../shared/livePollingConfig';
import type { PeriodKey } from '../../../shared/config';

/**
 * CIV-2056 (Ryan: "why don't we show many vehicles are in service right now"): a Fleet route group's vehicles on the road
 * now, from the same live feed the Live map polls, counted as Live's route list counts them. Null, and no polling, unless
 * Live reads every route of the group (liveFollowsRoute) and the picked time of day is the agency's current one, so a live
 * count never sits beside another period's schedule.
 */
export function useInServiceNow(slug: string, routes: readonly string[] | null, period: PeriodKey): number | null {
  const { agencies } = useAgencies();
  const timezone = agencies.find(a => a.slug === slug)?.timezone;
  const followed = !!routes?.length && routes.every(r => liveFollowsRoute(slug, r));
  const current = getNowPeriodForTimezone(timezone) === period;
  const { vehiclesBySlug } = useLiveFeeds(followed && current, followed && current ? [slug] : [], followed && current ? slug : '');
  const vehicles = vehiclesBySlug[slug];
  return useMemo(() => {
    if (!followed || !current || !vehicles || !routes) return null;
    const mine = new Set(routes);
    return vehicles.filter(v => mine.has(v.routeShortName)).length;
  }, [followed, current, vehicles, routes]);
}
