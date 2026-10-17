import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dateRangeText, runTimeTileStretch, weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../shared/liveDashboard';
import { kpiTiles, weekNotComparableLine, type Kpi } from './utils/liveKpi';
import ErrorBoundary from './components/ErrorBoundary';
import { ANALYZE_DEV_HINT } from './lib/liveReportData';
import DevHint from './components/Live/DevHint';
import DirectionStrip from './components/Live/DirectionStrip';
import { routeStripFromV3 } from './components/Live/routeStripModel';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import { syncUrlParams } from './utils/syncUrlParams';
import { shortStopName } from './utils/stopLabel';
import { useMediaQuery } from './hooks/useMediaQuery';
import { TILE } from './pageStyles';
import ArrowLink from './components/ui/ArrowLink';
import { SectionTitle } from './components/ui/PageTitle';
import MethodSection from './components/Live/sections/MethodSection';
import LateByHourSection from './components/Live/sections/LateByHourSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import { dirsOf } from './components/Live/sections/figures';
import type { LiveYesterday } from '../shared/liveYesterday';
import { LATE_BY_HOUR_TITLE, NOT_ENOUGH_YESTERDAY, againstLastWeekday, dayText } from '../shared/liveWording';

const MIN_N = 30;


function Delta({ k }: { k: Kpi }) {
  if (!k.delta) return <span className="text-xs text-[var(--text-dim)]">No comparison with last week</span>;
  const mark = k.delta.tone === 'better' ? 'text-[var(--status-positive-text)]' : k.delta.tone === 'worse' ? 'text-[var(--status-negative-text)]' : 'text-[var(--text-muted)]';
  return (
    <span className="flex items-baseline gap-1 text-xs tracking-tight" aria-label={k.delta.spoken} title={k.delta.spoken}>
      {k.delta.arrow !== 'none' && <span aria-hidden="true" data-tone={k.delta.tone} className={`text-2xs ${mark}`}>{k.delta.arrow === 'up' ? '▲' : '▼'}</span>}
      <span className="whitespace-nowrap font-bold text-[var(--text-muted)]">{k.delta.text}</span>
    </span>
  );
}

/** The week tiles, shared with the full analysis page (LiveRoutePage) so both say the same thing the same way. */
/** The Yesterday tiles: the same five figures for one day, against the same weekday a week before (CIV-278). */
export function YesterdayTiles({ y, tiles }: { y: LiveYesterday; tiles?: Kpi[] }) {
  if (!y.weekly.thisWeek.healthyDates.length) return <p className="mt-5 text-sm text-[var(--text-muted)]">{NOT_ENOUGH_YESTERDAY}</p>;
  const ks = (tiles ?? kpiTiles(y.weekly, y.daily)).map(k => (k.delta ? { ...k, delta: { ...k.delta, text: againstLastWeekday(k.delta.text, y.compareDate), spoken: againstLastWeekday(k.delta.spoken, y.compareDate) } } : k));
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
  if (!w) return <><p className="mt-4 text-sm text-[var(--text-muted)]">This week against last week is not in this analysis file.</p><DevHint hint={ANALYZE_DEV_HINT} /></>;
  return <KpiTiles tiles={kpiTiles(w, weekDailyValues(v3), 'both directions')} caption={weekNotComparableLine(w)} />;
}

/** One figure tile: title, big number, caption and the change line. The base look of every Live card. */
export function KpiTile({ k, className = '', math, bare = false }: { k: Kpi; className?: string; /** A line that explains how the figure is worked out (a threshold or a rule), under the caption. */ math?: string; /** The figure and its change only, no caption: where the explanation is shown once elsewhere. */ bare?: boolean }) {
  const faded = k.n < MIN_N;
  return (
    <li className={`${TILE} flex list-none flex-col px-2.5 ${faded ? 'opacity-60' : ''} ${className}`.trim()} title={`${k.n.toLocaleString()} ${k.unit} this week${k.nLastWeek != null ? `, ${k.nLastWeek.toLocaleString()} last week` : ''}${faded ? '. Few measurements: treat with care.' : ''}`}>
      <div className="text-sm font-bold text-[var(--text-muted)]">{k.label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{k.value}</div>
      {!bare && <div className="mt-0.5 text-xs leading-4 text-[var(--text-dim)]">{k.sub}</div>}
      {math && !bare && <div className="mt-0.5 text-xs leading-4 text-[var(--text-dim)]">{math}</div>}
      {k.scope && !bare && <div className="mt-0.5 text-xs leading-4 text-[var(--text-dim)]">{k.scope}</div>}
      <div className="mt-auto pt-2"><Delta k={k} /></div>
    </li>
  );
}

/** The week's figures as rows for a narrow column: the name, the figure, the change from last week; under it, the line that explains the math where there is one. */
export function KpiRows({ tiles, math, caption, captionTitle }: { tiles: Kpi[]; /** Per tile key, the line that explains how the figure is worked out. */ math?: Partial<Record<Kpi['key'], string>>; caption?: string | null; /** Hover text for the caption (the full rule behind it). */ captionTitle?: string }) {
  return (
    <section aria-label="This week compared with last week" className={`${TILE} !px-2.5 !py-1.5`}>
      <ul className="m-0 p-0">
        {tiles.map(k => (
          <li key={k.key} className={`list-none border-b border-[var(--border-primary)] py-1 last:border-b-0 ${k.n < MIN_N ? 'opacity-60' : ''}`}
            title={`${k.sub}. ${k.n.toLocaleString()} ${k.unit} this week${k.nLastWeek != null ? `, ${k.nLastWeek.toLocaleString()} last week` : ''}${k.n < MIN_N ? '. Few measurements: treat with care.' : ''}`}>
            <div className="grid grid-cols-[max-content_max-content_minmax(0,1fr)] items-baseline gap-x-1.5">
              <span className="text-xs font-bold text-[var(--text-muted)]">{k.label}</span>
              <span className="text-sm font-black tracking-tight">{k.value}</span>
              <Delta k={k} />
            </div>
            {[(k.key === 'bunching' && !math?.bunching) || (k.key === 'late' && !math?.late) ? k.sub : null, math?.[k.key]].filter(Boolean).map(line => <div key={line} className="text-xs leading-4 text-[var(--text-dim)]">{line}</div>)}
          </li>
        ))}
      </ul>
      {caption && <p className="m-0 mt-1.5 text-xs leading-4 text-[var(--text-dim)]" title={captionTitle}>{caption}</p>}
    </section>
  );
}

/** The tiles row itself: the route dashboard and the agency dashboard show their figures the same way. */
export function KpiTiles({ tiles, caption }: { tiles: Kpi[]; caption?: string | null }) {
  return (
    <section aria-label="This week compared with last week" className="mt-5">
      <ul className={`grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3 ${tiles.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        {tiles.map(k => <KpiTile key={k.key} k={k} />)}
      </ul>
      {caption && <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-dim)]">{caption}</p>}
    </section>
  );
}

/** Run time against the schedule by the hour a trip starts, one chart per direction on one scale. */
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
        <div className={`mt-3 ${PILL_ROW}`}>
          <PillGroup label="Direction shown" value={String(Math.min(phoneDir, all.length - 1))} onChange={v => setPhoneDir(Number(v))} options={all.map((d, i) => [String(i), d.label] as const)} />
        </div>
      )}
      {dirs.length ? (
        <div className="mt-4 grid gap-x-8 gap-y-10">
          {dirs.map(d => {
            const notes = (['delaysStart', 'bunchingForms'] as const).map(k => periodNote(v3, d.directionId, uncertain, k)).filter((x): x is string => !!x);
            return (
              <div key={d.directionId} className="min-w-0">
                {!pickable && <h3 className="text-base font-black">{d.label}</h3>}
                <DirectionStrip className="mt-2" v3={v3} directionId={d.directionId} band="all" uncertain={uncertain} />
                {notes.map(n => <p key={n} className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{n}</p>)}
              </div>
            );
          })}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stops were measured.</p>}
    </section>
  );
}

export default function LiveDashboardView({ v3, data, band, dir, uncertain, title, filters, toFull, lite = false, yesterday = null }: {
  v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; uncertain: UncertainStart[]; note: string | null; title: string;
  /** The direction and time-of-day pills: they sit below the week figures, above the parts they change. */
  filters: ReactNode;
  toFull: (hash: string) => void;
  /** The lite view: tiles, strip, late by hour and the Full analysis link only. */
  lite?: boolean;
  /** The lite view's Yesterday figures, when the Yesterday pill is on. */
  yesterday?: LiveYesterday | null;
}) {
  const bad = (what: string) => `${what} could not be drawn: the analysis file may be from an older version.`;
  // The lite view (?view=lite), made to share: the week's tiles, the route strip, late by hour and a way into the rest.
  if (lite) return (
    <>
      <ErrorBoundary label={bad('The week comparison')}>{yesterday ? <YesterdayTiles y={yesterday} /> : <KpiRow v3={v3} />}</ErrorBoundary>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} dir={null} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="spark" title={LATE_BY_HOUR_TITLE} v3={v3} data={data} band={band} dir={null} allOnly oneDay={yesterday ? yesterdayHours(yesterday) : undefined} /></ErrorBoundary>
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
      <ErrorBoundary label={bad('Run time')}><RunTimeSection v3={v3} band={band} dir={dir} detail="brief" /></ErrorBoundary>
      <ErrorBoundary label={bad(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="spark" title={LATE_BY_HOUR_TITLE} v3={v3} data={data} band={band} dir={dir} /></ErrorBoundary>
      <WorstStopsSection v3={v3} data={data} dir={dir} uncertain={uncertain} limit={5} columns="compact" title="Stops most often late" boundary={bad('The stop list')}
        footerLink={{ text: 'Every stop, in Full analysis', href: '?view=analysis#b2', onClick: () => toFull('b2') }} />
      <MethodSection scope="week" v3={v3} toFull={toFull} />
    </>
  );
}
