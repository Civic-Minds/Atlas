import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import PageShell from '../components/ui/PageShell';
import ResearchHeader from '../components/research/ResearchHeader';
import ResearchMethod from '../components/research/ResearchMethod';
import DataTable, { type DataTableColumn } from '../components/ui/DataTable';
import PillGroup from '../components/ui/PillGroup';
import ScrollX from '../components/ui/ScrollX';
import { EXPLAINERS } from '../content/noticeCopy';
import { FEATURE_ROUTES } from '../../shared/config';
import { formatClock, rankWorstFirst, type ConnectionWait, type StopWaitSummary } from '../../shared/connections';
import { agencyTodayYmd, isExpiredFeedExpiry } from '../../shared/feedAvailability';
import DATA from '../data/bustangConnections.json';

/**
 * Bustang connection check (CIV-101, beta only): for each Bustang arrival at a stop with another
 * agency's stop within 400 m, the real wait for the next local bus. Every wait, figure and rank
 * comes from shared/connections.ts. An agency whose schedule has ended is read from its last
 * timetable and labelled "Outdated schedule", never shown as current, and left out of the
 * figures at the top. All wording here is a draft for Ryan's word-for-word OK.
 */

type DayKey = 'Weekday' | 'Saturday' | 'Sunday';
interface StopDay { readDates: Record<string, string>; waits: ConnectionWait[] }
interface Stop { id: string; name: string; agencies: string[]; nearbyStops: number; closestM: number; days: Record<DayKey, StopDay> }
const stops = DATA.stops as unknown as Stop[];
const agencies = DATA.agencies as Record<string, { name: string; feedVersion: string | null; feedExpiry: string | null }>;
const DAYS: DayKey[] = ['Weekday', 'Saturday', 'Sunday'];
const DENVER = { timezone: 'America/Denver' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function shortDate(ymd: string, weekday = false): string {
  const d = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)));
  return `${weekday ? `${WEEKDAYS[d.getDay()]} ` : ''}${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** The agency's schedule has ended, judged in its own local date, as on the map. */
function isOutdated(slug: string): boolean {
  return isExpiredFeedExpiry(agencies[slug]?.feedExpiry, agencyTodayYmd(DENVER));
}
function outdatedLabel(slug: string): string {
  return `${EXPLAINERS['outdated-schedule'].title} (ended ${shortDate(agencies[slug].feedExpiry!)})`;
}
const outdatedAgencies = (stop: Stop) => stop.agencies.filter(isOutdated);

function OutdatedTag({ slugs }: { slugs: string[] }) {
  if (slugs.length === 0) return null;
  return (
    <span className="mt-1 block text-xs font-bold text-[var(--status-warn-text)]">
      {slugs.map(s => (slugs.length > 1 ? `${agencies[s].name}: ${outdatedLabel(s)}` : outdatedLabel(s))).join(' · ')}
    </span>
  );
}

const waitText = (min: number | null) => (min === null ? '–' : `${min} min`);

interface Ranked { item: Stop; summary: StopWaitSummary }

export default function BustangConnectionsPage() {
  const [params, setParams] = useSearchParams();
  const day = (DAYS as string[]).includes(params.get('day') ?? '') ? (params.get('day') as DayKey) : 'Weekday';
  const selectedId = params.get('stop');

  const ranked = useMemo(
    () => rankWorstFirst(stops.filter(s => s.days[day].waits.length > 0), s => s.days[day].waits),
    [day],
  );
  // Figures at the top read current schedules only, so an outdated timetable is never counted as current.
  const current = ranked.filter(r => outdatedAgencies(r.item).length === 0);
  const longest = current.reduce<number | null>((m, r) => (r.summary.longestWaitMin === null ? m : Math.max(m ?? 0, r.summary.longestWaitMin)), null);
  const noBus = current.reduce((n, r) => n + r.summary.noBusAfter, 0);
  const arrivals = current.reduce((n, r) => n + r.summary.arrivals, 0);
  const anyOutdated = ranked.length !== current.length;

  const hrefFor = (next: { day?: DayKey; stop?: string | null }) => {
    const p = new URLSearchParams();
    const d = next.day ?? day;
    if (d !== 'Weekday') p.set('day', d);
    const s = next.stop === undefined ? selectedId : next.stop;
    if (s) p.set('stop', s);
    const q = p.toString();
    return `${FEATURE_ROUTES.bustangConnections}${q ? `?${q}` : ''}`;
  };

  const listColumns: DataTableColumn<Ranked>[] = [
    {
      key: 'stop', header: 'Bustang stop', rowHeader: true, className: 'font-normal',
      cell: r => (
        <>
          <a href={hrefFor({ stop: r.item.id })} className="font-bold text-[var(--text-primary)] underline-offset-2 hover:underline" aria-current={r.item.id === selectedId ? 'true' : undefined}>
            {r.item.name}
          </a>
          <OutdatedTag slugs={outdatedAgencies(r.item)} />
        </>
      ),
    },
    { key: 'agencies', header: 'Local agencies within 400 m', cell: r => r.item.agencies.map(s => agencies[s].name).join(', ') },
    { key: 'arrivals', header: 'Arrivals', cell: r => r.summary.arrivals, className: 'tabular-nums' },
    { key: 'nobus', header: 'No local bus after', cell: r => r.summary.noBusAfter, className: 'tabular-nums' },
    { key: 'longest', header: 'Longest wait', cell: r => waitText(r.summary.longestWaitMin), className: 'tabular-nums' },
    { key: 'median', header: 'Median wait', cell: r => waitText(r.summary.medianWaitMin), className: 'tabular-nums' },
  ];

  const selected = stops.find(s => s.id === selectedId) ?? null;
  const selectedWaits = selected ? selected.days[day].waits : [];
  const detailColumns: DataTableColumn<ConnectionWait>[] = [
    { key: 'arr', header: 'Bustang arrives', rowHeader: true, className: 'font-normal tabular-nums', cell: w => formatClock(w.arrival.time) },
    { key: 'route', header: 'Bustang line', cell: w => w.arrival.routeName },
    { key: 'wait', header: 'Wait', className: 'tabular-nums font-bold', cell: w => (w.waitMin === null ? 'No local bus after this' : `${w.waitMin} min`) },
    { key: 'next', header: 'Next local bus', cell: w => (w.next ? `${agencies[w.next.agencySlug].name} ${w.next.routeName}` : '–') },
    { key: 'leaves', header: 'Leaves', className: 'tabular-nums', cell: w => (w.next ? formatClock(w.next.time) : '–') },
    { key: 'where', header: 'From', cell: w => (w.next ? `${w.next.stopName}, ${w.next.distanceM} m` : '–') },
  ];

  const method = (
    <ResearchMethod parts={{
      dateConducted: <>{shortDate(DATA.builtFrom)}, {DATA.builtFrom.slice(0, 4)}, from the schedules Atlas published that day.</>,
      sample: <>Every {DATA.hub.name} stop where riders can get off with another Colorado agency's stop within {DATA.nearbyMeters} m in a straight line. Bustang Outrider is not included.</>,
      sources: <>Each agency's published GTFS schedule. Dates checked: {DAYS.map(d => `${d.toLowerCase()} ${shortDate(DATA.dates[d], true)}`).join(', ')}.</>,
      whatCounted: <>For each Bustang arrival, the wait until the next departure of any local bus at a stop within {DATA.nearbyMeters} m, the same day. A bus leaving in the same minute counts. No walking time is added, and there is no cut-off for a long wait. Stops are listed worst first: most arrivals with no local bus after them, then the longest wait.</>,
      limitations: <>Schedules only, not real-time. Distance is a straight line, not a walking route. An agency whose schedule has ended is shown from its last timetable, labelled outdated, and left out of the figures at the top.</>,
    }} />
  );

  return (
    <PageShell stickyHeader method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader title="Bustang connections" intro={<p>How long riders wait for a local bus after each Bustang arrival.</p>} />

        <div className="mx-auto mt-10 max-w-3xl space-y-10 sm:mt-12">
          <PillGroup
            label="Day"
            options={DAYS.map(d => [d, `${d} (${shortDate(DATA.dates[d], true)})`] as const)}
            value={day}
            onChange={v => setParams(new URL(hrefFor({ day: v as DayKey }), window.location.origin).searchParams)}
          />

          <dl className="grid grid-cols-3 gap-3">
            {[
              { label: 'Bustang arrivals', value: arrivals },
              { label: 'No local bus after', value: noBus },
              { label: 'Longest wait', value: longest === null ? '–' : `${longest} min` },
            ].map(f => (
              <div key={f.label} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-panel)] p-4">
                <dt className="text-xs font-bold leading-5 text-[var(--text-muted)]">{f.label}</dt>
                <dd className="mt-1 text-3xl font-black tabular-nums tracking-tight sm:text-4xl">{f.value}</dd>
              </div>
            ))}
          </dl>
          {anyOutdated && <p className="-mt-7 text-xs text-[var(--text-muted)]">Current schedules only.</p>}

          <section aria-labelledby="bustang-stops">
            <h2 id="bustang-stops" className="text-xs font-black text-[var(--text-primary)]">Stops, worst wait first</h2>
            <ScrollX className="mt-4">
              <DataTable variant="ruled" caption="Bustang stops, worst wait first" columns={listColumns} rows={ranked} rowKey={r => r.item.id} />
            </ScrollX>
          </section>

          {selected && (
            <section aria-labelledby="bustang-stop-detail">
              <h2 id="bustang-stop-detail" className="text-xs font-black text-[var(--text-primary)]">{selected.name}: each arrival</h2>
              <OutdatedTag slugs={outdatedAgencies(selected)} />
              {selectedWaits.length === 0
                ? <p className="mt-4 text-sm text-[var(--text-muted)]">No Bustang arrivals this day.</p>
                : (
                  <ScrollX className="mt-4">
                    <DataTable variant="ruled" caption={`${selected.name}: each Bustang arrival`} columns={detailColumns} rows={selectedWaits} rowKey={w => `${w.arrival.time}-${w.arrival.routeName}-${w.arrival.headsign}`} />
                  </ScrollX>
                )}
            </section>
          )}
        </div>
      </article>
    </PageShell>
  );
}
