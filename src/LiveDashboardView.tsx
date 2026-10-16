import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { periodKeyForHour } from '../shared/config';
import { branchFigures, branchRunTimeLine, dateRangeText, rankStops, runTimeStretchLabel, runTimeTileStretch, runTimeTakeaway, weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../shared/liveDashboard';
import { kpiTiles, lateForDays, weekNotComparableLine, weekWindowLine, type DayKind, type Kpi } from './utils/liveKpi';
import ErrorBoundary from './components/ErrorBoundary';
import SortableDataTable from './components/ui/SortableDataTable';
import { withoutDevHint } from './lib/liveReportData';
import HourSpark, { type HourValue } from './components/charts/HourSpark';
import RunTimeChart, { runTimeScale } from './components/charts/RunTimeChart';
import RouteStrip, { routeStripFromV3 } from './components/Live/RouteStrip';
import Pill from './components/ui/Pill';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { shortStopName } from './utils/stopLabel';
import { liveChartHours } from './utils/sparklinePeriods';
import { useMediaQuery } from './hooks/useMediaQuery';
import { TILE } from './pageStyles';
import ArrowLink from './components/ui/ArrowLink';
import LegendItem from './components/ui/LegendItem';
import { SectionTitle } from './components/ui/PageTitle';
import { lateCount, lateHourLine, METHOD_GROUPS } from '../shared/liveWording';
import MethodFootnote from './components/Live/MethodFootnote';
import type { LiveYesterday } from '../shared/liveYesterday';
import { NOT_ENOUGH_YESTERDAY, againstLastWeekday, dayText } from '../shared/liveWording';
import { colourLine, recordingGapsLine } from './components/Live/methodLines';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', '−');
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;
const MIN_N = 30;
const BAND_WORDS: Record<DashboardBand, string> = { all: 'all day', amPeak: 'in the AM peak', midday: 'at midday', pmPeak: 'in the PM peak', evening: 'in the evening' };
const DAY_KINDS: [DayKind, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];

const dirsOf = (v3: LiveV3, dir: number | null) => Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b).filter(d => dir == null || d === dir);

function Delta({ k }: { k: Kpi }) {
  if (!k.delta) return <span className="text-xs text-[var(--text-dim)]">No comparison with last week</span>;
  const tone = k.delta.tone === 'better' ? 'text-[var(--status-positive-text)]' : k.delta.tone === 'worse' ? 'text-[var(--status-negative-text)]' : 'text-[var(--text-muted)]';
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className={`whitespace-nowrap font-bold ${tone}`} aria-label={k.delta.spoken} title={k.delta.spoken}>{k.delta.text}</span>
    </span>
  );
}

/** The week tiles, shared with the full analysis page (LiveRoutePage) so both say the same thing the same way. */
/** The Yesterday tiles: the same five figures for one day, against the same weekday a week before (CIV-278). */
export function YesterdayTiles({ y, tiles }: { y: LiveYesterday; tiles?: Kpi[] }) {
  if (!y.weekly.thisWeek.healthyDates.length) return <p className="mt-5 text-sm text-[var(--text-muted)]">{NOT_ENOUGH_YESTERDAY}</p>;
  const ks = (tiles ?? kpiTiles(y.weekly, y.daily)).map(k => (k.delta ? { ...k, delta: { ...k.delta, text: againstLastWeekday(k.delta.text, y.compareDate) } } : k));
  // The comparison is named in the page subtitle ("Thursday, Oct 15, compared with Thursday, Oct 8"), not under the tiles.
  return <KpiTiles tiles={ks} caption={y.weekly.comparable ? '' : NOT_ENOUGH_YESTERDAY} />;
}

/** The Yesterday view's late-by-hour, for Days. */
export const yesterdayHours = (y: LiveYesterday) => ({
  label: dayText(y.date),
  late: y.weekly.thisWeek.late ? { ...y.weekly.thisWeek.late, days: 1 } : null,
  hours: y.lateByHour.filter(h => h.n > 0).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n })),
});

export function KpiRow({ v3 }: { v3: LiveV3 }) {
  const w = v3.weekly;
  if (!w) return <p className="mt-4 text-sm text-[var(--text-muted)]">{withoutDevHint('This week against last week is not in this analysis file. Rebuild it with npm run live:analyze.')}</p>;
  return <KpiTiles tiles={kpiTiles(w, weekDailyValues(v3))} caption={weekNotComparableLine(w)} />;
}

/** The week comparison explained, at the bottom of the page (the tiles carry only the two date ranges). */
function WeekMethod({ v3, toFull }: { v3: LiveV3; toFull: (hash: string) => void }) {
  if (!v3.weekly) return null;
  return (
    <MethodFootnote id="dash-method" collapsible after={<p className="mt-2 text-xs"><ArrowLink href="?view=analysis#method" onClick={(e: React.MouseEvent) => { e.preventDefault(); toFull('method'); }}>The full method, in Full analysis</ArrowLink></p>}
    groups={[
      { label: METHOD_GROUPS.data, items: [weekWindowLine(v3.weekly)] },
      { label: METHOD_GROUPS.colours, items: [colourLine] },
      { label: METHOD_GROUPS.limits, items: [recordingGapsLine] },
    ]} />
  );
}

/** The tiles row itself: the route dashboard and the agency dashboard show their figures the same way. */
export function KpiTiles({ tiles, caption }: { tiles: Kpi[]; caption?: string | null }) {
  return (
    <section aria-label="This week compared with last week" className="mt-5">
      <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${tiles.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {tiles.map(k => {
          const faded = k.n < MIN_N;
          return (
            <li key={k.key} className={`${TILE} flex list-none flex-col ${faded ? 'opacity-60' : ''}`} title={`${k.n.toLocaleString()} ${k.unit} this week${k.nLastWeek != null ? `, ${k.nLastWeek.toLocaleString()} last week` : ''}${faded ? '. Few measurements: treat with care.' : ''}`}>
              <div className="text-sm font-bold text-[var(--text-muted)]">{k.label}</div>
              <div className="mt-1 text-3xl font-black tracking-tight">{k.value}</div>
              <div className="mt-0.5 text-xs leading-4 text-[var(--text-dim)]">{k.sub}</div>
              <div className="mt-auto pt-3"><Delta k={k} /></div>
            </li>
          );
        })}
      </ul>
      {caption && <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-dim)]">{caption}</p>}
    </section>
  );
}

/** Late share and lateness by hour for all days, weekdays and weekends, side by side on one scale. */
function Days({ v3, data, band, dir, allOnly = false, oneDay }: { v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; /** The lite view: the All days chart only. */ allOnly?: boolean; /** The Yesterday view: that day's figures in place of the week's. */ oneDay?: { label: string; late: { share: number; n: number; days: number } | null; hours: HourValue[] } }) {
  const healthy = v3.weekly?.thisWeek.healthyDates ?? v3.window.dates;
  const cols = oneDay ? [{ kind: 'all' as const, label: oneDay.label, late: oneDay.late, hours: oneDay.hours }] : DAY_KINDS.filter(([kind]) => !allOnly || kind === 'all').map(([kind, label]) => {
    const block = data.adherence.timepoints[kind];
    const late = lateForDays(block.byDate, healthy, kind);
    const hours: HourValue[] = block.byHour.filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));
    return { kind, label, late, hours };
  });
  const max = Math.max(0.1, ...cols.flatMap(c => c.hours.filter(h => h.n >= MIN_N).map(h => h.value)));
  const scale = { min: 0, max: Math.ceil(max * 10) / 10 };
  return (
    <section aria-labelledby="dash-days" className="mt-10">
      <SectionTitle id="dash-days">Late, by day and hour</SectionTitle>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        How often trips leave the end of the line more than 5 min late, by kind of day and the hour they start.
        {dir != null && ' Both directions: this view is not split by direction yet.'}
      </p>
      <div className={`mt-4 grid gap-x-8 gap-y-6 ${allOnly ? '' : 'md:grid-cols-3'}`}>
        {cols.map(c => (
          <div key={c.kind} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-black">{c.label}</h3>
              <span className="text-sm text-[var(--text-dim)]">{c.late ? `${c.late.days} ${c.late.days === 1 ? 'day' : 'days'}` : ''}</span>
            </div>
            {c.late && c.late.n > 0 ? (
              <>
                <div className="mt-1 text-2xl font-black tracking-tight" title={`${c.late.n.toLocaleString()} departures`}>{pct(c.late.share)} <span className="text-sm font-bold text-[var(--text-muted)]">late</span></div>
                <div className="mt-2">
                  {c.hours.length ? (
                    <HourSpark departures height={allOnly ? 120 : undefined} hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)} values={c.hours} hours={liveChartHours(h => cols.some(cc => (cc.hours.find(x => x.hour === h)?.n ?? 0) >= 30))} scale={scale} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
                      ariaLabel={`${c.label}: share of departures late by hour of the day, ${pct(c.late.share)} late overall.`} />
                  ) : <p className="text-sm text-[var(--text-muted)]">No departures in this part of the day.</p>}
                </div>
              </>
            ) : <p className="mt-1 text-sm text-[var(--text-muted)]">No {c.label.toLowerCase()} with good recordings this week.</p>}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <LegendItem color="var(--status-negative-text)">Late %</LegendItem>
        <LegendItem kind="line" color="var(--text-dim)">Departures</LegendItem>
      </div>
      {!allOnly && <p className="mt-2 text-xs text-[var(--text-dim)]">Faded bars are based on fewer than {MIN_N} departures. The percentages count only days with good recordings, as the tiles do; the hourly bars count every day of the week.</p>}
    </section>
  );
}

/** Run time against the schedule by the hour a trip starts, one chart per direction on one scale. */
function TripTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  const groups = dirsOf(v3, dir).map(d => ({
    d,
    label: v3.directionLabels[String(d)],
    hours: (rt?.byHour[String(d)] ?? []).filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)),
  }));
  const scale = runTimeScale(groups.map(g => g.hours));
  return (
    <section aria-labelledby="dash-runtime" className="mt-10">
      <SectionTitle id="dash-runtime">Run time</SectionTitle>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, {BAND_WORDS[band]}, over the stops every regular trip serves, so short turns count too.</p>
      <div className={`mt-4 grid gap-x-10 gap-y-8 ${groups.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {groups.map(g => (
          <div key={g.d} className="min-w-0">
            <h3 className="text-base font-black">{g.label}</h3>
            {runTimeStretchLabel(rt?.stretch?.[String(g.d)], n => shortStopName(titleCase(n))) && <p className="text-sm text-[var(--text-muted)]">{runTimeStretchLabel(rt?.stretch?.[String(g.d)], n => shortStopName(titleCase(n)))}</p>}
            {g.hours.length > 1 ? (
              <>
                <p className="mt-1 text-sm font-bold">{runTimeTakeaway(g.label, g.hours)}</p>
                <div className="mt-2"><RunTimeChart hours={g.hours} axis={liveChartHours(h => groups.some(gg => gg.hours.some(x => x.hour === h && x.n >= 5)))} scale={scale} ariaLabel={`${g.label}: run time against the schedule by the hour the trip starts. ${runTimeTakeaway(g.label, g.hours)}`} /></div>
              </>
            ) : <p className="mt-1 text-sm text-[var(--text-muted)]">Too few trips were measured {BAND_WORDS[band]} to draw this.</p>}
            {(rt?.branches?.[String(g.d)] ?? []).length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm font-black">Longer patterns, each end to end</h4>
                <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
                  {rt!.branches![String(g.d)].flatMap(b => { const f = branchFigures(b, band); return f ? [<li key={`${b.fromStopId}-${b.toStopId}`} className={f.n < 30 ? 'text-[var(--text-dim)]' : ''}>{branchRunTimeLine(b, n => shortStopName(titleCase(n)), f)}{f.n < 30 ? ' Few trips: treat with care.' : ''}</li>] : []; })}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Each direction as a line of stops coloured by typical delay or by bunching, with where it starts marked. */
const PERIODS: [DashboardBand, string][] = [['amPeak', 'AM peak'], ['midday', 'midday'], ['pmPeak', 'PM peak'], ['evening', 'evening']];
/** A period's marked stretch counts as "elsewhere" when it ends this many stops or more from the all-day one. */
const ELSEWHERE_STOPS = 3;

/**
 * One line when where delays start, or where bunching forms, is clearly somewhere else at some time of day than over
 * the whole day; null when every period agrees (or names no single place). No toggle: the strip shows the whole day.
 */
export function periodNote(v3: LiveV3, directionId: number, uncertain: UncertainStart[], kind: 'delaysStart' | 'bunchingForms'): string | null {
  const day = routeStripFromV3(v3, directionId, 'all', uncertain);
  const at = (id: string | undefined) => (id ? day.stops.findIndex(s => s.stopId === id) : -1);
  const dayEnd = at(day[kind]?.toStopId);
  const parts = PERIODS.flatMap(([band, label]) => {
    if (!v3.bands?.[band]) return [];
    const p = routeStripFromV3(v3, directionId, band, uncertain)[kind];
    const end = at(p?.toStopId);
    if (end < 0 || (dayEnd >= 0 && Math.abs(end - dayEnd) < ELSEWHERE_STOPS)) return [];
    return [`${label} near ${shortStopName(day.stops[end].name)}`];
  });
  if (!parts.length) return null;
  return `${kind === 'delaysStart' ? 'Delays start' : 'Bunching forms'} elsewhere at some times of day: ${parts.join(', ')}.`;
}

/** Each direction as two lines of stops on the same positions: delay on top, bunching underneath. */
function AlongRoute({ v3, dir, uncertain }: { v3: LiveV3; dir: number | null; uncertain: UncertainStart[] }) {
  const all = useMemo(() => dirsOf(v3, dir).map(d => routeStripFromV3(v3, d, 'all', uncertain)).filter(d => d.stops.length > 1), [v3, dir, uncertain]);
  // Phones show one direction at a time, so the two strips are not stacked down a long page.
  const phone = useMediaQuery('(max-width: 479px)');
  const [phoneDir, setPhoneDir] = useState(0);
  const pickable = phone && all.length > 1;
  const dirs = pickable ? [all[Math.min(phoneDir, all.length - 1)]] : all;
  return (
    <section aria-labelledby="dash-strip" className="mt-10">
      <SectionTitle id="dash-strip">Along the route</SectionTitle>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        Each stop coloured twice, over the whole day: how late cars typically leave it, and how often the gaps between cars are too close or too far apart. Hover or tap a stop for its figures.
      </p>
      {pickable && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Direction shown">
          {all.map((d, i) => <Pill key={d.directionId} size="segment" selected={i === Math.min(phoneDir, all.length - 1)} onClick={() => setPhoneDir(i)}>{d.label}</Pill>)}
        </div>
      )}
      {dirs.length ? (
        <div className="mt-4 grid gap-x-8 gap-y-10">
          {dirs.map(d => {
            const notes = (['delaysStart', 'bunchingForms'] as const).map(k => periodNote(v3, d.directionId, uncertain, k)).filter((x): x is string => !!x);
            return (
              <div key={d.directionId} className="min-w-0">
                {!pickable && <h3 className="text-base font-black">{d.label}</h3>}
                <RouteStrip className="mt-2" stops={d.stops} directionLabel={d.label} delaysStart={d.delaysStart} bunchingForms={d.bunchingForms} />
                {notes.map(n => <p key={n} className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{n}</p>)}
              </div>
            );
          })}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stops were measured.</p>}
    </section>
  );
}

function WorstStops({ v3, data, dir, uncertain, toFull }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[]; toFull: (hash: string) => void }) {
  const top = useMemo(() => rankStops(data.stops, dir, uncertain).slice(0, 5), [data, dir, uncertain]);
  return (
    <div className="min-w-0">
      <SectionTitle>Stops most often late</SectionTitle>
      {top.length ? (
        <div className="mt-3">
          <SortableDataTable
            caption="The five stops with the highest share of late departures"
            defaultSort="late"
            rows={top}
            rowKey={s => `${s.stopId}-${s.directionId}`}
            columns={[
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: s => <span title={s.name}>{s.name}</span> },
              ...(dir == null ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof top)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
              { key: 'late', header: 'Late', worst: s => s.lateShare, cell: s => <span title={`${s.n.toLocaleString()} departures`}>{pct(s.lateShare)}</span> },
            ]}
          />
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>}
      <p className="mt-3"><ArrowLink href="?view=analysis#b2" onClick={(e: React.MouseEvent) => { e.preventDefault(); toFull('b2'); }}>Every stop, in Full analysis</ArrowLink></p>
    </div>
  );
}

export default function LiveDashboardView({ v3, data, band, dir, uncertain, title, filters, toFull, lite = false, yesterday = null, periodPills = null }: {
  v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; uncertain: UncertainStart[]; note: string | null; title: string;
  /** The direction and time-of-day pills: they sit below the week figures, above the parts they change. */
  filters: ReactNode;
  toFull: (hash: string) => void;
  /** The lite view: tiles, strip, late by hour and the Full analysis link only. */
  lite?: boolean;
  /** The lite view's Yesterday figures, when the Yesterday pill is on. */
  yesterday?: LiveYesterday | null;
  /** The This week / Yesterday pills, shown above the tiles in the lite view. */
  periodPills?: ReactNode;
}) {
  const bad = (what: string) => withoutDevHint(`${what} could not be drawn: the analysis file may be from an older version. Rebuild it with npm run live:analyze.`);
  // The lite view (?view=lite), made to share: the week's tiles, the route strip, late by hour and a way into the rest.
  if (lite) return (
    <>
      {periodPills}
      <ErrorBoundary label={bad('The week comparison')}>{yesterday ? <YesterdayTiles y={yesterday} /> : <KpiRow v3={v3} />}</ErrorBoundary>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} dir={null} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad('Late by day and hour')}><Days v3={v3} data={data} band={band} dir={null} allOnly oneDay={yesterday ? yesterdayHours(yesterday) : undefined} /></ErrorBoundary>
      <p className="mt-8"><ArrowLink href="?view=analysis" onClick={(e: React.MouseEvent) => { e.preventDefault(); toFull(''); }}>Full analysis</ArrowLink></p>
    </>
  );
  return (
    <>
      <ErrorBoundary label={bad('The week comparison')}><KpiRow v3={v3} /></ErrorBoundary>
      <div className="mt-8 border-t border-[var(--border-primary)] pt-2">
        <p className="mt-3 text-sm text-[var(--text-muted)]">The direction you pick changes everything below. The figures above are the whole week, both directions.</p>
        {filters}
      </div>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} dir={dir} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad('Run time')}><TripTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
      <ErrorBoundary label={bad('Late by day and hour')}><Days v3={v3} data={data} band={band} dir={dir} /></ErrorBoundary>
      <section className="mt-10 max-w-xl" aria-label="The stops most often late">
        <ErrorBoundary label={bad('The stop list')}><WorstStops v3={v3} data={data} dir={dir} uncertain={uncertain} toFull={toFull} /></ErrorBoundary>
      </section>
      <WeekMethod v3={v3} toFull={toFull} />
    </>
  );
}
