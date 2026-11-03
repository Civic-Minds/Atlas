import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import PageShell from '../components/ui/PageShell';
import ResearchHeader from '../components/research/ResearchHeader';
import ResearchMethod from '../components/research/ResearchMethod';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import PillGroup, { PILL_ROW } from '../components/ui/PillGroup';
import ScrollX from '../components/ui/ScrollX';
import RouteRowName from '../components/RouteRowName';
import { EXPLAINERS } from '../content/noticeCopy';
import { CONTROL_ACTIVE } from '../styles';
import { clockTime } from '../../shared/timeText';
import { NEARBY_CHOICES, parseNearbyChoice, rankWorstFirst, type ConnectionWait, type NearbyChoice, type StopWaitSummary } from '../../shared/connections';
import { agencyTodayYmd, isExpiredFeedExpiry } from '../../shared/feedAvailability';
import DATA from '../data/bustangConnections.json';

/**
 * Bustang connection check (CIV-101, beta only): for each Bustang arrival at a stop with another
 * agency's stop within the chosen distance (200, 400 or 800 m), the real wait for the next local bus.
 * Every wait, figure and rank comes from shared/connections.ts. A schedule that has ended, Bustang's
 * own included, is read from its last timetable and labelled "Outdated schedule", never shown as
 * current, and left out of the figures at the top. All wording is a draft for Ryan's word-for-word OK.
 */

type DayKey = 'Weekday' | 'Saturday' | 'Sunday';
type ByChoice<T> = Record<`${NearbyChoice}`, T>;
interface StopDay { hubDate: string; readDates: Record<string, string>; waits: ByChoice<ConnectionWait[]> }
interface Stop { id: string; name: string; agencies: ByChoice<string[]>; days: Record<DayKey, StopDay> }
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

export default function BustangConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const day = (DAYS as string[]).includes(params.get('day') ?? '') ? (params.get('day') as DayKey) : 'Weekday';
  const within = parseNearbyChoice(params.get('within'));
  const selectedId = params.get('stop');
  const hubOutdated = ended(hub);
  const detailRef = useRef<HTMLElement>(null);
  const scrollOnSelect = useRef(false);

  const update = (next: { day?: DayKey; within?: NearbyChoice; stop?: string | null }) => {
    const p = new URLSearchParams(params);
    const set = (key: string, value: string | null, fallback: string | null) => (value && value !== fallback ? p.set(key, value) : p.delete(key));
    if (next.day) set('day', next.day, 'Weekday');
    if (next.within) set('within', String(next.within), '400');
    if (next.stop !== undefined) set('stop', next.stop, null);
    setParams(p, { replace: true, preventScrollReset: true });
  };

  // A click on a stop brings its arrivals into view (they sit below the whole list).
  useEffect(() => {
    if (scrollOnSelect.current && selectedId) detailRef.current?.scrollIntoView?.({ block: 'start' });
    scrollOnSelect.current = false;
  }, [selectedId]);

  const ranked = useMemo(
    () => rankWorstFirst(
      stops.filter(s => s.agencies[within].length > 0 && s.days[day].waits[within].length > 0),
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

  const listColumns: DataTableColumn<Ranked>[] = [
    {
      key: 'stop', header: 'Bustang stop', rowHeader: true, className: 'font-normal',
      cell: r => {
        const selected = r.item.id === selectedId;
        return (
          <>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => { scrollOnSelect.current = true; update({ stop: r.item.id }); }}
              className={`-mx-1.5 rounded-md border px-1.5 text-left font-bold text-[var(--text-primary)] underline-offset-2 hover:underline ${selected ? CONTROL_ACTIVE : 'border-transparent'}`}
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

  const selected = stops.find(s => s.id === selectedId && s.agencies[within].length > 0) ?? null;
  // Each row keyed by its place: two trips of one line can arrive in the same minute (Harmony, North).
  const selectedWaits = selected ? selected.days[day].waits[within].map((w, i) => ({ ...w, key: i })) : [];
  // The agency is named only where the stop has more than one; the list row already names a single one.
  const nameAgency = !!selected && selected.agencies[within].length > 1;
  const detailColumns: DataTableColumn<ConnectionWait & { key: number }>[] = [
    { key: 'arr', header: 'Bustang arrives', rowHeader: true, className: `font-normal ${NOWRAP}`, cell: w => clockTime(w.arrival.time) },
    { key: 'route', header: 'Bustang line', cell: w => w.arrival.routeName, narrowHide: true },
    { key: 'wait', header: 'Wait', className: 'font-bold tabular-nums', cell: w => (w.waitMin === null ? 'No local bus after this' : waitText(w.waitMin)) },
    {
      key: 'next', header: 'Next local bus',
      cell: w => (w.next
        ? <>{nameAgency && <span className="mr-1.5">{agencies[w.next.agencySlug].name}</span>}<RouteRowName shortName={w.next.routeName} /></>
        : '–'),
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
      sample: <>Every {hub.name} stop where riders can get off with another Colorado agency's stop within 200, 400 or 800 m in a straight line, as chosen above. Bustang Outrider is not included.</>,
      sources: <>Each agency's published schedule data. Dates checked: {listJoin(DAYS.map(d => shortDate(DATA.dates[d], true)))}.</>,
      whatCounted: <>For each Bustang arrival, the wait until the next departure of any local bus at a stop within the chosen distance, the same day. A bus leaving in the same minute counts. No walking time is added, and there is no cut-off for a long wait. Stops are listed worst first: most arrivals with no local bus after them, then the longest wait.</>,
      limitations: <>Schedules only, not real-time. Distance is a straight line, not a walking route. A schedule that has ended, Bustang's included, is shown from its last schedule, labelled outdated, and left out of the figures at the top.</>,
    }} />
  );

  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader title="Bustang connections" intro={<p>How long riders wait for a local bus after each Bustang arrival.</p>} />

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
                  <dd className="mt-1 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">{f.value}</dd>
                </div>
              ))}
            </dl>
            {anyOutdated && <p className="mt-3 text-xs text-[var(--text-muted)]">Current schedules only.</p>}
          </div>

          <section aria-labelledby="bustang-stops">
            <h2 id="bustang-stops" className="text-xs font-black text-[var(--text-primary)]">Stops, worst wait first</h2>
            <ScrollX className="mt-4">
              <DataTable variant="ruled" caption="Bustang stops, worst wait first" columns={listColumns} rows={ranked} rowKey={r => r.item.id} />
            </ScrollX>
          </section>

          {selected && (
            <section ref={detailRef} aria-labelledby="bustang-stop-detail" className="scroll-mt-24">
              <h2 id="bustang-stop-detail" className="text-xs font-black text-[var(--text-primary)]">{selected.name}: each arrival</h2>
              <OutdatedTag list={outdatedAt(selected, within)} />
              {selectedWaits.length === 0
                ? <p className="mt-4 text-sm text-[var(--text-muted)]">No Bustang arrivals this day.</p>
                : (
                  <ScrollX className="mt-4">
                    <DataTable variant="ruled" layout="fill" narrowFit caption={`${selected.name}: each Bustang arrival`} columns={detailColumns} rows={selectedWaits} rowKey={w => w.key} />
                  </ScrollX>
                )}
            </section>
          )}
        </div>
      </article>
    </PageShell>
  );
}
