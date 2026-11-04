import { useEffect, useMemo, useState } from 'react';
import Pill from '../ui/Pill';
import RouteRowName from '../RouteRowName';
import { CARD_SUMMARY, SidebarCardSection } from '../Interval/cardUi';
import { clockTime } from '../../../shared/timeText';
import { bestWindow, CONNECTION_WINDOWS, windowOf, type NearbyChoice, type RouteConnection } from '../../../shared/connections';
import type { DayType } from '../../../shared/dayTypes';
import { EXPLAINERS } from '../../content/noticeCopy';
import { compareRouteNumber } from '../../utils/sortCompare';
import {
  scheduleEnded, tripsForRoute, waitWithin,
  type BustangAgency, type BustangData, type BustangStop, type TripRouteWaits,
} from '../../utils/bustangConnections';

/**
 * The Bustang connections view's additions to the map's own cards (CIV-101, beta only, shown only on
 * /research/bustang-connections): the Bustang route card's departure list, and the stop card's Bustang
 * connections. Every wait and count is read from the built data (shared/connections.ts). All wording is a
 * draft for Ryan's word-for-word OK.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (ymd: string) => `${MONTHS[Number(ymd.slice(4, 6)) - 1]} ${Number(ymd.slice(6, 8))}`;
export const outdatedLabel = (a: BustangAgency) => `${EXPLAINERS['outdated-schedule'].title} (ended ${shortDate(a.feedExpiry!)})`;

// Small, regular and grey, as the cards' schedule notices are (STYLE.md).
const NOTICE = 'text-xs text-[var(--text-muted)]';

/** The outdated schedules a stop reads (Bustang's own, then its local agencies'), one line each. */
function OutdatedLines({ data, slugs }: { data: BustangData; slugs: string[] }) {
  const list = [...(scheduleEnded(data.hub) ? [data.hub] : []), ...slugs.map(s => data.agencies[s]).filter(a => a && scheduleEnded(a))];
  if (list.length === 0) return null;
  return <>{list.map(a => <p key={a.name} className={`${NOTICE} mt-1`}>{a.name}: {outdatedLabel(a)}</p>)}</>;
}

/** A local route's name, with its agency's short name in front where the stop has more than one local agency. */
function LocalRoute({ data, agencySlug, routeName, nameAgency }: { data: BustangData; agencySlug: string; routeName: string; nameAgency: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {nameAgency && <span className="mr-1 text-[var(--text-muted)]">{data.agencies[agencySlug]?.name ?? agencySlug}</span>}
      <RouteRowName shortName={routeName} />
    </span>
  );
}

const SIDE_LABEL = { after: 'Getting off Bustang', before: 'Catching Bustang' } as const;

/* ---------- Route card: departures ---------- */

/** One trip stop's local routes on one side, in 15 / 30 / 60 min groups, each route with its wait. */
function TripSide({ data, rows, within, side, nameAgency }: { data: BustangData; rows: TripRouteWaits[]; within: NearbyChoice; side: 'after' | 'before'; nameAgency: boolean }) {
  const routes = rows
    .map(r => ({ agencySlug: data.routes[r[0]][0], routeName: data.routes[r[0]][1], wait: waitWithin(r, within) }))
    .filter((r): r is { agencySlug: string; routeName: string; wait: number } => r.wait !== null)
    .sort((a, b) => a.wait - b.wait || compareRouteNumber(a.routeName, b.routeName, null, null));
  return (
    <div className="mt-1.5">
      <p className="text-xs font-bold text-[var(--text-primary)]">{SIDE_LABEL[side]}</p>
      {routes.length === 0
        ? <p className={CARD_SUMMARY}>No local route within 60 min.</p>
        : CONNECTION_WINDOWS.map(w => {
          const inGroup = routes.filter(r => windowOf(r.wait) === w);
          if (inGroup.length === 0) return null;
          return (
            <p key={w} className="mt-0.5 text-xs leading-relaxed text-[var(--text-primary)]">
              <span className="mr-1.5 whitespace-nowrap text-[var(--text-muted)]">Within {w}&nbsp;min:</span>
              {inGroup.map((r, i) => (
                <span key={`${r.agencySlug} ${r.routeName}`}>
                  {i > 0 && ', '}
                  <LocalRoute data={data} agencySlug={r.agencySlug} routeName={r.routeName} nameAgency={nameAgency} />
                  {' '}<span className="whitespace-nowrap text-[var(--text-muted)]">in&nbsp;{r.wait}&nbsp;min</span>
                </span>
              ))}
            </p>
          );
        })}
    </div>
  );
}

/**
 * The Bustang route card's departure list: each trip's first departure on the day, grouped by where it goes.
 * Picking one shows every stop on that trip with the local routes meeting it there within 15, 30 and 60 min.
 */
export function BustangRouteDepartures({ data, day, within, routeId }: { data: BustangData; day: DayType; within: NearbyChoice; routeId: string }) {
  const trips = useMemo(() => tripsForRoute(data, day, routeId), [data, day, routeId]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => { setPicked(null); }, [routeId, day]);
  // Grouped by where each trip starts and where it goes, so two trips leaving at the same time from different
  // stops read apart ("Grand Junction Regional Airport to Denver", "West Glenwood Park & Ride to Denver").
  const directions = useMemo(() => {
    const groups = new Map<string, typeof trips>();
    for (const t of trips) {
      const from = data.stops[t.stops[0].stop].name;
      const k = t.headsign ? `${from} to ${t.headsign}` : `From ${from}`;
      groups.set(k, [...(groups.get(k) ?? []), t]);
    }
    return [...groups];
  }, [trips, data]);
  const trip = trips.find(t => t.id === picked) ?? null;

  return (
    <SidebarCardSection label={`Departures (${day})`}>
      {trips.length === 0 && <p className={CARD_SUMMARY}>No Bustang trips this day.</p>}
      {directions.map(([title, list]) => (
        <div key={title} className="mb-2">
          <p className="text-xs font-bold text-[var(--text-muted)] mb-1">{title}</p>
          <div className="flex flex-wrap gap-1">
            {list.map(t => (
              <Pill key={t.id} selected={t.id === picked} onClick={() => setPicked(p => (p === t.id ? null : t.id))} className="tabular-nums">
                {clockTime(t.stops[0].departure)}
              </Pill>
            ))}
          </div>
          {/* The picked trip's stops open under its own group, next to the time that was tapped. */}
          {trip && list.includes(trip) && (
            <div className="mt-1">
              <OutdatedLines data={data} slugs={[...new Set(trip.stops.flatMap(s => data.stops[s.stop].agencies[within]))]} />
              <ol className="divide-y divide-[var(--border-primary)]">
                {trip.stops.map((ts, i) => {
                  const stop = data.stops[ts.stop];
                  const nameAgency = stop.agencies[within].length > 1;
                  const hasLocal = stop.agencies[within].length > 0;
                  return (
                    <li key={`${ts.stop}-${i}`} className="py-2">
                      <p className="text-xs font-bold text-[var(--text-primary)]">{stop.name}</p>
                      <p className={`${CARD_SUMMARY} mt-0 tabular-nums`}>
                        {ts.after ? `Arrives ${clockTime(ts.arrival)}` : `Leaves ${clockTime(ts.departure)}`}
                        {ts.after && ts.before && ts.departure !== ts.arrival ? `, leaves ${clockTime(ts.departure)}` : ''}
                      </p>
                      {!hasLocal
                        ? <p className={CARD_SUMMARY}>No local stop within {within} m.</p>
                        : <>
                          {ts.after && <TripSide data={data} rows={ts.after} within={within} side="after" nameAgency={nameAgency} />}
                          {ts.before && <TripSide data={data} rows={ts.before} within={within} side="before" nameAgency={nameAgency} />}
                        </>}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      ))}
      {trips.length > 0 && !trip && <p className={CARD_SUMMARY}>Pick a departure to see the local routes at each stop.</p>}
    </SidebarCardSection>
  );
}

/* ---------- Stop card: this stop's Bustang connections ---------- */

/** One side: each local route once, in its best group (15, 30 or 60 min), with how many Bustang trips it meets there. */
function StopSide({ data, routes, trips, side, nameAgency }: { data: BustangData; routes: RouteConnection[]; trips: number; side: 'after' | 'before'; nameAgency: boolean }) {
  const placed = routes.map(r => ({ route: r, best: bestWindow(r) }));
  const notWithin = placed.filter(p => p.best === null).map(p => p.route);
  return (
    <div className="mt-2">
      <p className="text-xs font-bold text-[var(--text-primary)]">{SIDE_LABEL[side]}</p>
      {trips === 0
        ? <p className={CARD_SUMMARY}>{side === 'after' ? 'Bustang drops nobody off here this day.' : 'Bustang picks nobody up here this day.'}</p>
        : <>
          {placed.every(p => p.best === null) && <p className={CARD_SUMMARY}>No local route within 60 min.</p>}
          {CONNECTION_WINDOWS.filter(w => placed.some(p => p.best?.window === w)).map((w, i) => {
            const inGroup = placed.filter(p => p.best?.window === w);
            return (
              <div key={w} className="mt-1">
                <p className="flex justify-between gap-3 text-xs text-[var(--text-muted)]"><span>Within {w} min</span>{i === 0 && <span>Bustang trips</span>}</p>
                <ul>
                  {inGroup.map(({ route, best }) => (
                    <li key={`${route.agencySlug} ${route.routeName}`} className="flex items-baseline justify-between gap-3 py-0.5 text-xs text-[var(--text-primary)]">
                      <span className="min-w-0 flex items-baseline">
                        <LocalRoute data={data} agencySlug={route.agencySlug} routeName={route.routeName} nameAgency={nameAgency} />
                        <span className="ml-1.5 min-w-0 truncate text-[var(--text-muted)]">{route.stopName}</span>
                        <span className="shrink-0 whitespace-nowrap text-[var(--text-muted)]">, {route.distanceM}&nbsp;m</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap tabular-nums">{best!.count} of {best!.of}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {notWithin.length > 0 && (
            <p className={CARD_SUMMARY}>
              Not within 60 min: {notWithin.map((r, i) => <span key={`${r.agencySlug} ${r.routeName}`}>{i > 0 && ', '}<LocalRoute data={data} agencySlug={r.agencySlug} routeName={r.routeName} nameAgency={nameAgency} /></span>)}
            </p>
          )}
        </>}
    </div>
  );
}

/** The stop card's Bustang section: local routes that connect with Bustang here, getting off and catching it. */
export function BustangStopConnections({ data, day, within, stop }: { data: BustangData; day: DayType; within: NearbyChoice; stop: BustangStop }) {
  const stopDay = stop.days[day];
  const routes = stopDay.routes[within];
  const slugs = stop.agencies[within];
  const nameAgency = slugs.length > 1;
  return (
    <SidebarCardSection label={`Bustang connections (${day})`}>
      <div>
        {slugs.length === 0
          ? <p className={CARD_SUMMARY}>No local stop within {within} m.</p>
          : <>
            <OutdatedLines data={data} slugs={slugs} />
            <StopSide data={data} routes={routes.after} trips={stopDay.arrivals} side="after" nameAgency={nameAgency} />
            <StopSide data={data} routes={routes.before} trips={stopDay.departures} side="before" nameAgency={nameAgency} />
          </>}
      </div>
    </SidebarCardSection>
  );
}
