import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import PageShell from '../components/ui/PageShell';
import ResearchHeader from '../components/research/ResearchHeader';
import ResearchMethod from '../components/research/ResearchMethod';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import PillGroup, { PILL_ROW } from '../components/ui/PillGroup';
import ScrollX from '../components/ui/ScrollX';
import RouteRowName from '../components/RouteRowName';
import { SectionTitle } from '../components/ui/PageTitle';
import BustangStopMap, { type StopMapPoint } from '../components/research/BustangStopMap';
import { EXPLAINERS } from '../content/noticeCopy';
import { CONTROL_ACTIVE } from '../styles';
import { clockTime } from '../../shared/timeText';
import {
  bestWindow, CONNECTION_WINDOWS, NEARBY_CHOICES, parseNearbyChoice, rankWorstFirst, worstWaitGroup,
  type ConnectionWait, type NearbyChoice, type RouteConnection, type StopWaitSummary,
} from '../../shared/connections';
import { agencyTodayYmd, isExpiredFeedExpiry } from '../../shared/feedAvailability';
import DATA from '../data/bustangConnections.json';

/**
 * Bustang connection check (CIV-101, beta only). A Colorado map of the Bustang stops, each coloured
 * by its longest wait for a local bus after Bustang arrives; picking a stop shows its local routes on
 * two sides (Ryan, 2026-11-04): "Getting off Bustang" (routes leaving within 15, 30 or 60 min after it
 * arrives) and "Catching Bustang" (routes dropping riders off within 15, 30 or 60 min before it leaves),
 * each route once per side in its best group. Local stops are within the chosen distance (200, 400 or 800 m).
 * Every wait, figure and rank comes from shared/connections.ts. A schedule that has ended, Bustang's
 * own included, is read from its last timetable and labelled "Outdated schedule", never shown as
 * current, and left out of the figures at the top. All wording is a draft for Ryan's word-for-word OK.
 */

type DayKey = 'Weekday' | 'Saturday' | 'Sunday';
type ByChoice<T> = Record<`${NearbyChoice}`, T>;
interface SideRoutes { after: RouteConnection[]; before: RouteConnection[] }
interface StopDay { hubDate: string; readDates: Record<string, string>; waits: ByChoice<ConnectionWait[]>; routes: ByChoice<SideRoutes>; departures: number }
interface Stop { id: string; name: string; lat: number; lon: number; agencies: ByChoice<string[]>; days: Record<DayKey, StopDay> }
interface Agency { name: string; feedVersion: string | null; feedExpiry: string | null }
const stops = DATA.stops as unknown as Stop[];
const agencies = DATA.agencies as Record<string, Agency>;
const hub = DATA.hub as Agency & { slug: string };
const DAYS: DayKey[] = ['Weekday', 'Saturday', 'Sunday'];
const DENVER = { timezone: 'America/Denver' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function shortDate(ymd: string, weekday = false): string {
  const d = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return `${weekday ? `${WEEKDAYS[d.getDay()]} ` : ''}${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
const listJoin = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** A schedule has ended, judged in Colorado's local date, as on the map. */
const ended = (a: Agency) => isExpiredFeedExpiry(a.feedExpiry, agencyTodayYmd(DENVER));
const outdatedLabel = (a: Agency) => `${EXPLAINERS['outdated-schedule'].title} (ended ${shortDate(a.feedExpiry!)})`;
/** Every outdated schedule a stop's rows read: Bustang's own, then its local agencies'. */
function outdatedAt(stop: Stop, within: NearbyChoice): Agency[] {
  return [...(ended(hub) ? [hub] : []), ...stop.agencies[within].map(s => agencies[s]).filter(ended)];
}

function OutdatedTag({ list }: { list: Agency[] }) {
  if (list.length === 0) return null;
  return (
    <span className="mt-1 block text-xs font-bold text-[var(--status-warn-text)]">
      {list.map(a => (list.length > 1 ? `${a.name}: ${outdatedLabel(a)}` : outdatedLabel(a))).join(' · ')}
    </span>
  );
}

const waitText = (min: number | null) => (min === null ? '–' : `${min} min`);
const NOWRAP = 'whitespace-nowrap tabular-nums';

interface Ranked { item: Stop; summary: StopWaitSummary }

/** The agency's short name in front of a route only where the stop has more than one local agency. */
function RouteName({ route, nameAgency }: { route: Pick<RouteConnection, 'agencySlug' | 'routeName'>; nameAgency: boolean }) {
  return <>{nameAgency && <span className="mr-1.5">{agencies[route.agencySlug].name}</span>}<RouteRowName shortName={route.routeName} /></>;
}

/** One side of a stop's panel: each local route once, in its best group (within 15, 30 or 60 min), with its count. */
function SideRoutesList({ id, title, intro, routes, trips, noTrips, nameAgency }: {
  id: string; title: string; intro: string; routes: RouteConnection[]; trips: number; noTrips: string; nameAgency: boolean;
}) {
  const placed = routes.map(r => ({ route: r, best: bestWindow(r) }));
  const notWithin = placed.filter(p => p.best === null).map(p => p.route);
  const groups = CONNECTION_WINDOWS.map(w => ({ w, inGroup: placed.filter(p => p.best?.window === w) })).filter(g => g.inGroup.length > 0);
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
      <h3 id={id} className="text-base font-black text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{intro}</p>
      {trips === 0
        ? <p className="mt-4 text-sm text-[var(--text-muted)]">{noTrips}</p>
        : (
          <>
            {groups.length === 0 && <p className="mt-4 text-sm text-[var(--text-muted)]">No local route within 60 min.</p>}
            {groups.map(({ w, inGroup }) => (
              <div key={w} className="mt-4">
                <h4 className="flex justify-between gap-3 text-xs font-bold text-[var(--text-muted)]"><span>Within {w} min</span><span>Bustang trips</span></h4>
                <ul className="mt-1 divide-y divide-[var(--border-primary)]">
                  {inGroup.map(({ route, best }) => (
                    <li key={`${route.agencySlug} ${route.routeName}`} className="flex items-baseline justify-between gap-3 py-1 text-sm" title={`${route.stopName}, ${route.distanceM} m`}>
                      <span className="min-w-0 truncate">
                        <RouteName route={route} nameAgency={nameAgency} />
                        <span className="ml-1.5 text-xs text-[var(--text-muted)]">{route.stopName}, {route.distanceM}&nbsp;m</span>
                      </span>
                      <span className={`shrink-0 text-right ${NOWRAP}`}>{best!.count} of {best!.of}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {notWithin.length > 0 && (
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Not within 60 min: {notWithin.map((r, i) => <span key={`${r.agencySlug} ${r.routeName}`}>{i > 0 && ', '}<RouteName route={r} nameAgency={nameAgency} /></span>)}
              </p>
            )}
          </>
        )}
    </section>
  );
}

export default function BustangConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const day = (DAYS as string[]).includes(params.get('day') ?? '') ? (params.get('day') as DayKey) : 'Weekday';
  const within = parseNearbyChoice(params.get('within'));
  const hubOutdated = ended(hub);
  const panelRef = useRef<HTMLElement>(null);
  const scrollOnSelect = useRef(false);

  const update = (next: { day?: DayKey; within?: NearbyChoice; stop?: string | null }) => {
    const p = new URLSearchParams(params);
    const set = (key: string, value: string | null, fallback: string | null) => (value && value !== fallback ? p.set(key, value) : p.delete(key));
    if (next.day) set('day', next.day, 'Weekday');
    if (next.within) set('within', String(next.within), '400');
    if (next.stop !== undefined) set('stop', next.stop, null);
    setParams(p, { replace: true, preventScrollReset: true });
  };

  // Every stop with a local agency within the distance where Bustang stops that day, ranked worst first.
  const ranked = useMemo(
    () => rankWorstFirst(
      stops.filter(s => s.agencies[within].length > 0 && (s.days[day].waits[within].length > 0 || s.days[day].departures > 0)),
      s => s.days[day].waits[within],
    ),
    [day, within],
  );
  // The figures read current schedules only, so an outdated schedule is never counted as current.
  const current = ranked.filter(r => outdatedAt(r.item, within).length === 0);
  const longest = current.reduce<number | null>((m, r) => (r.summary.longestWaitMin === null ? m : Math.max(m ?? 0, r.summary.longestWaitMin)), null);
  const noBus = current.reduce((n, r) => n + r.summary.noBusAfter, 0);
  const arrivals = current.reduce((n, r) => n + r.summary.arrivals, 0);
  const anyOutdated = ranked.length !== current.length;

  // With no stop picked, the panel shows the worst current stop, so the page opens on real detail.
  const picked = ranked.find(r => r.item.id === params.get('stop')) ?? current[0] ?? ranked[0] ?? null;
  const selected = picked?.item ?? null;
  const selectedId = selected?.id ?? null;

  // A pick brings the stop's panel into view (on a phone it sits below the map).
  useEffect(() => {
    if (scrollOnSelect.current) panelRef.current?.scrollIntoView?.({ block: 'nearest' });
    scrollOnSelect.current = false;
  }, [selectedId]);
  const pick = (id: string) => { scrollOnSelect.current = true; update({ stop: id }); };

  const points: StopMapPoint[] = useMemo(() => ranked.map(r => ({
    id: r.item.id, name: r.item.name, lat: r.item.lat, lon: r.item.lon,
    group: outdatedAt(r.item, within).length > 0 ? 'outdated' : (worstWaitGroup(r.summary) ?? 'pickup'),
  })), [ranked, within]);

  const listColumns: DataTableColumn<Ranked>[] = [
    {
      key: 'stop', header: 'Bustang stop', rowHeader: true, className: 'font-normal',
      cell: r => {
        const isSelected = r.item.id === selectedId;
        return (
          <>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => pick(r.item.id)}
              className={`-mx-1.5 rounded-md border px-1.5 text-left font-bold text-[var(--text-primary)] underline-offset-2 hover:underline ${isSelected ? CONTROL_ACTIVE : 'border-transparent'}`}
            >
              {r.item.name}
            </button>
            <OutdatedTag list={outdatedAt(r.item, within)} />
          </>
        );
      },
    },
    { key: 'agencies', header: `Local agencies within ${within} m`, cell: r => r.item.agencies[within].map(s => agencies[s].name).join(', ') },
    { key: 'arrivals', header: 'Arrivals', cell: r => r.summary.arrivals, className: 'tabular-nums' },
    { key: 'nobus', header: 'Arrivals with no local bus after', cell: r => r.summary.noBusAfter, className: 'tabular-nums' },
    { key: 'longest', header: 'Longest wait', cell: r => waitText(r.summary.longestWaitMin), className: NOWRAP },
    { key: 'typical', header: 'Typical wait', cell: r => waitText(r.summary.medianWaitMin), className: NOWRAP },
  ];

  const stopDay = selected?.days[day] ?? null;
  // Each row keyed by its place: two trips of one line can arrive in the same minute (Harmony, North).
  const selectedWaits = selected && stopDay ? stopDay.waits[within].map((w, i) => ({ ...w, key: i })) : [];
  // The agency is named only where the stop has more than one; the stop's heading already names a single one.
  const nameAgency = !!selected && selected.agencies[within].length > 1;
  const detailColumns: DataTableColumn<ConnectionWait & { key: number }>[] = [
    { key: 'arr', header: 'Bustang arrives', rowHeader: true, className: `font-normal ${NOWRAP}`, cell: w => clockTime(w.arrival.time) },
    { key: 'route', header: 'Bustang line', cell: w => w.arrival.routeName, narrowHide: true },
    { key: 'wait', header: 'Wait', className: 'font-bold tabular-nums', cell: w => (w.waitMin === null ? 'No local bus after this' : waitText(w.waitMin)) },
    {
      key: 'next', header: 'Next local bus',
      cell: w => (w.next ? <RouteName route={w.next} nameAgency={nameAgency} /> : '–'),
    },
    {
      key: 'leaves', header: 'Leaves from',
      cell: w => (w.next
        ? <><span className={NOWRAP}>{clockTime(w.next.time)}</span><span className="block text-xs text-[var(--text-muted)]">{w.next.stopName}, <span className={NOWRAP}>{w.next.distanceM}&nbsp;m</span></span></>
        : '–'),
    },
  ];

  const method = (
    <ResearchMethod parts={{
      dateConducted: <>{shortDate(DATA.builtFrom)}, {DATA.builtFrom.slice(0, 4)}, from the schedules Atlas published that day.</>,
      sample: <>Every {hub.name} stop where riders can get off or on with another Colorado agency's stop within 200, 400 or 800 m in a straight line, as chosen above. Bustang Outrider is not included.</>,
      sources: <>Each agency's published schedule data. Dates checked: {listJoin(DAYS.map(d => shortDate(DATA.dates[d], true)))}.</>,
      whatCounted: <>Getting off Bustang: for each Bustang arrival, the wait until a local bus leaves a stop within the chosen distance, the same day. Catching Bustang: for each Bustang departure, the wait since a local bus dropped riders off at such a stop. A bus in the same minute counts, and no walking time is added. Each local route is listed once per side, in the shortest group (15, 30 or 60 min) it makes for at least one Bustang trip, with how many trips it makes in that group; a route's buses in either direction and at any of its nearby stops count. The map and the list of stops use the longest wait after a Bustang arrival, with no pass or fail.</>,
      limitations: <>Schedules only, not real-time. Distance is a straight line, not a walking route. A schedule that has ended, Bustang's included, is shown from its last schedule, labelled outdated, and left out of the figures at the top.</>,
    }} />
  );

  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader title="Bustang connections" intro={<p>Which local buses connect with Bustang at each stop, within 15, 30 or 60 minutes of it arriving or leaving.</p>} />

        <div className="mx-auto mt-10 max-w-3xl space-y-10 sm:mt-12">
          <div className={PILL_ROW}>
            <PillGroup label="Day" options={DAYS.map(d => [d, `${d} (${shortDate(DATA.dates[d], true)})`] as const)} value={day} onChange={v => update({ day: v as DayKey })} />
            <PillGroup label="Local stop within" options={NEARBY_CHOICES.map(m => [String(m), `${m} m`] as const)} value={String(within)} onChange={v => update({ within: parseNearbyChoice(v) })} />
          </div>

          {hubOutdated && <p className="text-sm font-bold text-[var(--status-warn-text)]">{hub.name}: {outdatedLabel(hub)}</p>}

          <div>
            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: 'Bustang arrivals', value: arrivals },
                { label: 'Arrivals with no local bus after', value: noBus },
                { label: 'Longest wait', value: longest === null ? '–' : `${longest} min` },
              ].map(f => (
                <div key={f.label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
                  <dt className="text-xs font-bold leading-5 text-[var(--text-muted)]">{f.label}</dt>
                  <dd className="mt-1 text-2xl font-black tabular-nums tracking-tight sm:text-4xl">{f.value}</dd>
                </div>
              ))}
            </dl>
            {anyOutdated && <p className="mt-3 text-xs text-[var(--text-muted)]">Current schedules only.</p>}
          </div>

          <BustangStopMap points={points} selectedId={selectedId} onPick={pick} />

          {selected && stopDay && (
            <section ref={panelRef} aria-labelledby="bustang-stop-detail" className="scroll-mt-24">
              <SectionTitle id="bustang-stop-detail">{selected.name}</SectionTitle>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Local agencies within {within} m: {selected.agencies[within].map(s => agencies[s].name).join(', ')}</p>
              <OutdatedTag list={outdatedAt(selected, within)} />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SideRoutesList
                  id="bustang-getting-off" title="Getting off Bustang"
                  intro="Local routes you can catch after Bustang arrives."
                  routes={stopDay.routes[within].after} trips={stopDay.waits[within].length}
                  noTrips="Bustang doesn't drop riders off here this day." nameAgency={nameAgency}
                />
                <SideRoutesList
                  id="bustang-catching" title="Catching Bustang"
                  intro="Local routes that drop you off before Bustang leaves."
                  routes={stopDay.routes[within].before} trips={stopDay.departures}
                  noTrips="Bustang doesn't pick riders up here this day." nameAgency={nameAgency}
                />
              </div>
              {selectedWaits.length > 0 && (
                <details className="group mt-6">
                  <summary className="cursor-pointer text-sm font-bold text-[var(--text-primary)]">Each Bustang arrival</summary>
                  <ScrollX className="mt-4">
                    <DataTable variant="ruled" layout="fill" narrowFit caption={`${selected.name}: each Bustang arrival`} columns={detailColumns} rows={selectedWaits} rowKey={w => w.key} />
                  </ScrollX>
                </details>
              )}
            </section>
          )}

          <section aria-labelledby="bustang-stops">
            <SectionTitle id="bustang-stops">All stops, worst wait first</SectionTitle>
            <ScrollX className="mt-4">
              <DataTable variant="ruled" caption="Bustang stops, worst wait first" columns={listColumns} rows={ranked} rowKey={r => r.item.id} />
            </ScrollX>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
