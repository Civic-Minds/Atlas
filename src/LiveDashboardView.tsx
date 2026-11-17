import DataTable from './components/ui/DataTable';
import { MISSING_VALUE } from '../shared/missingValue';
import { useMemo, useState, type ReactNode } from 'react';
import { weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../shared/liveDashboard';
import { kpiTiles, weekNotComparableLine, type Kpi, type KpiTone } from './utils/liveKpi';
import ErrorBoundary from './components/ErrorBoundary';
import { ANALYZE_DEV_HINT } from './lib/liveReportData';
import DevHint from './components/Live/DevHint';
import DirectionStrip, { StripsLegend } from './components/Live/DirectionStrip';
import { routeStripFromV3 } from './components/Live/routeStripModel';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import { shortStopName } from './utils/stopLabel';
import { useMediaQuery } from './hooks/useMediaQuery';
import Card from './components/ui/Card';
import { KPI_TILE } from './components/Live/kpiTileStyle';
import ArrowLink from './components/ui/ArrowLink';
import Section from './components/Live/sections/Section';
import LateByHourSection from './components/Live/sections/LateByHourSection';
import RunTimeSection from './components/Live/sections/RunTimeSection';
import WorstStopsSection from './components/Live/sections/WorstStopsSection';
import { dirsOf } from './components/Live/sections/figures';
import { ALONG_ROUTE_TITLE, DELAY_STARTS_LABEL, LATE_BY_HOUR_TITLE, LATE_STOPS_TITLE, TRIP_TIME_LABEL, WEEK_COMPARE_TITLE, BUNCHING_FORMS_LABEL } from '../shared/liveWording';
import { LIVE_FEW_MEASUREMENTS, LIVE_NO_STOPS_MEASURED, LIVE_NO_WEEK_COMPARISON, liveDrawError, DIRECTION_SHOWN_LABEL, LIVE_FULL_REPORT_VIEW, LIVE_EVERY_STOP_LINK, MEASURE_LABEL, THIS_WEEK_COLUMN, LAST_WEEK_COLUMN, LIVE_ALONG_ROUTE_INTRO, LIVE_DIRECTION_PICK_NOTE } from './content/noticeCopy';
import { countText } from '../shared/numberText';
import { SubsectionTitle } from './components/ui/PageTitle';

const MIN_N = 30;


/** The change arrow's colour by its tone: the tiles and the week table colour a change the same way. */
const TONE_TEXT: Record<KpiTone, string> = { better: 'text-[var(--status-positive-text)]', worse: 'text-[var(--status-negative-text)]', same: 'text-[var(--text-muted)]' };

function Delta({ k }: { k: Kpi }) {
  if (!k.delta) return <span className="text-xs text-[var(--text-dim)]">{LIVE_NO_WEEK_COMPARISON}</span>;
  const mark = TONE_TEXT[k.delta.tone];
  return (
    <span className="flex items-baseline gap-1 text-xs tracking-tight" aria-label={k.delta.spoken} title={k.delta.spoken}>
      {k.delta.arrow !== 'none' && <span aria-hidden="true" data-tone={k.delta.tone} className={`text-2xs ${mark}`}>{k.delta.arrow === 'up' ? '▲' : '▼'}</span>}
      <span className="whitespace-nowrap font-bold text-[var(--text-muted)]">{k.delta.text}</span>
    </span>
  );
}

/** The week tiles, shared with the full analysis page (LiveRoutePage) so both say the same thing the same way. */
export function KpiRow({ v3 }: { v3: LiveV3 }) {
  const w = v3.weekly;
  if (!w) return <><p className="mt-4 text-sm text-[var(--text-muted)]">{LIVE_NO_WEEK_COMPARISON}</p><DevHint hint={ANALYZE_DEV_HINT} /></>;
  return <KpiTiles tiles={kpiTiles(w, weekDailyValues(v3), 'both directions')} caption={weekNotComparableLine(w)} />;
}

/** One figure tile: title, big number, caption and the change line. The base look of every Live card. */
export function KpiTile({ k, className = '', math, bare = false, caption = false }: { k: Kpi; className?: string; /** With `bare`: still show the one caption line under the figure. */ caption?: boolean; /** A line that explains how the figure is worked out (a threshold or a rule), under the caption. */ math?: string; /** The figure and its change only, no caption: where the explanation is shown once elsewhere. */ bare?: boolean }) {
  const faded = k.n < MIN_N;
  return (
    <Card as="li" tone="surface" className={`${KPI_TILE.frame} ${faded ? 'opacity-60' : ''} ${className}`.trim()} title={`${bare ? `${k.sub}. ` : ''}${countText(k.n)} ${k.unit} this week${k.nLastWeek != null ? `, ${countText(k.nLastWeek)} last week` : ''}${faded ? `. ${LIVE_FEW_MEASUREMENTS}` : ''}`}>
      <div className={KPI_TILE.label}>{k.label}</div>
      <div className={KPI_TILE.value}>{k.value}</div>
      {(!bare || caption) && <div className={`${bare ? 'mt-0 leading-3' : 'mt-0.5 leading-4'} text-xs text-[var(--text-dim)]`}>{k.sub}</div>}
      {math && !bare && <div className={KPI_TILE.line}>{math}</div>}
      {k.scope && !bare && <div className={KPI_TILE.line}>{k.scope}</div>}
      <div className={`mt-auto ${bare && caption ? 'pt-0.5' : 'pt-2'}`}><Delta k={k} /></div>
    </Card>
  );
}

/**
 * The week's figures as a small aligned table: the measure, this week, last week (numbers right-aligned). The small arrow
 * sits beside this week's value, coloured by the same tone as the tiles, and only where the rounded values differ; where
 * they match, the row says nothing extra (its hover text says "same as last week"). The short math lines are notes under
 * the table. One component for any surface that wants it; the planner's left panel uses it today.
 */
export function WeekTable({ tiles, notes, caption, captionTitle, scope, excluding, excludingTitle }: {
  tiles: Kpi[];
  /** The lines that explain how the figures are worked out, in order, under the table. */
  notes?: readonly string[];
  caption?: string | null;
  /** Hover text for the caption (the full rule behind it). */
  captionTitle?: string;
  /** What the figures cover, in the first column's header ("TTC"). */
  scope?: string;
  /** The days left out, as one note directly under the table ("Excluding Oct 11 this week, Oct 4 last week"), with its hover reason. */
  excluding?: string | null;
  excludingTitle?: string;
}) {
  return (
    <Card as="section" tone="surface" aria-label={WEEK_COMPARE_TITLE} className="min-w-0 px-2.5 py-1.5">
      <DataTable
        caption={WEEK_COMPARE_TITLE}
        rows={tiles}
        rowKey={k => k.key}
        rowTitle={k => `${k.sub}. ${countText(k.n)} ${k.unit} this week${k.nLastWeek != null ? `, ${countText(k.nLastWeek)} last week` : ''}${k.delta ? `. ${k.delta.spoken}` : ''}${k.n < MIN_N ? `. ${LIVE_FEW_MEASUREMENTS}` : ''}`}
        columns={[
          { key: 'measure', header: <span className="font-bold text-[var(--text-primary)]"><span className="sr-only">{MEASURE_LABEL} </span>{scope}</span>, rowHeader: true, className: `font-bold text-[var(--text-muted)]`, cell: k => <span className={k.n < MIN_N ? 'opacity-60' : ''}>{k.label}</span> },
          { key: 'now', header: <span className="block text-right font-normal text-[var(--text-dim)]">{THIS_WEEK_COLUMN}</span>, className: 'text-right text-sm font-black tracking-tight', cell: k => (
            <span className={k.n < MIN_N ? 'opacity-60' : ''}>
              {k.delta && k.delta.arrow !== 'none' && <span aria-hidden="true" data-tone={k.delta.tone} className={`mr-1 text-2xs font-bold ${TONE_TEXT[k.delta.tone]}`}>{k.delta.arrow === 'up' ? '▲' : '▼'}</span>}
              {k.value}
            </span>
          ) },
          { key: 'last', header: <span className="block text-right font-normal text-[var(--text-dim)]">{LAST_WEEK_COLUMN}</span>, className: 'text-right text-sm text-[var(--text-muted)]', cell: k => <span className={k.n < MIN_N ? 'opacity-60' : ''}>{k.delta ? k.lastWeekText ?? MISSING_VALUE : MISSING_VALUE}</span> },
        ]}
      />
      {/* The footnote: how the figures are worked out, kept visible but small and light (Live rule: math explanations stay visible). */}
      {excluding && <p className="m-0 mt-1 border-t border-[var(--border-primary)] pt-1 text-xs leading-4 text-[var(--text-dim)] opacity-75" title={excludingTitle}>{excluding}</p>}
      {notes && notes.length > 0 && (
        <ul className={`m-0 list-none p-0 text-pretty ${excluding ? 'mt-0.5' : 'mt-1 border-t border-[var(--border-primary)] pt-1'}`}>
          {notes.map(n => <li key={n} className="text-xs leading-4 text-[var(--text-dim)] opacity-75">{n}</li>)}
        </ul>
      )}
      {caption && <p className="m-0 mt-0.5 text-xs leading-4 text-[var(--text-dim)] opacity-75" title={captionTitle}>{caption}</p>}
    </Card>
  );
}

/** The tiles row itself: the route dashboard and the agency dashboard show their figures the same way. */
export function KpiTiles({ tiles, caption }: { tiles: Kpi[]; caption?: string | null }) {
  return (
    <section aria-label={WEEK_COMPARE_TITLE} className="mt-5">
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
  return `${kind === 'delaysStart' ? DELAY_STARTS_LABEL : BUNCHING_FORMS_LABEL} elsewhere at some times of day: ${parts.join(', ')}.`;
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
    <Section id="dash-strip" title={ALONG_ROUTE_TITLE} intro={LIVE_ALONG_ROUTE_INTRO}>
      {pickable && (
        <div className={`mt-3 ${PILL_ROW}`}>
          <PillGroup label={DIRECTION_SHOWN_LABEL} value={String(Math.min(phoneDir, all.length - 1))} onChange={v => setPhoneDir(Number(v))} options={all.map((d, i) => [String(i), d.label] as const)} />
        </div>
      )}
      {/* One key for every direction shown, above the strips as in the Full analysis, as the map's route card shows its key once (CIV-1448). */}
      <StripsLegend v3={v3} directionIds={dirs.map(d => d.directionId)} band="all" uncertain={uncertain} />
      {dirs.length ? (
        <div className="mt-4 grid gap-x-8 gap-y-10">
          {dirs.map(d => {
            const notes = (['delaysStart', 'bunchingForms'] as const).map(k => periodNote(v3, d.directionId, uncertain, k)).filter((x): x is string => !!x);
            return (
              <div key={d.directionId} className="min-w-0">
                {!pickable && <SubsectionTitle>{d.label}</SubsectionTitle>}
                <DirectionStrip className="mt-2" v3={v3} directionId={d.directionId} band="all" uncertain={uncertain} legend={false} />
                {notes.map(n => <p key={n} className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">{d.label}: {n}</p>)}
              </div>
            );
          })}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">{LIVE_NO_STOPS_MEASURED}</p>}
    </Section>
  );
}

export default function LiveDashboardView({ v3, data, band, dir, uncertain, filters, toFull, lite = false }: {
  v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; uncertain: UncertainStart[];
  /** The direction and time-of-day pills: they sit below the week figures, above the parts they change. */
  filters: ReactNode;
  toFull: (hash: string) => void;
  /** The lite view: tiles, strip, late by hour and the Full analysis link only. */
  lite?: boolean;
}) {
  const bad = liveDrawError;
  // The lite view (?view=lite), made to share: the week's tiles, the route strip, late by hour and a way into the rest.
  if (lite) return (
    <>
      <ErrorBoundary label={bad('The week comparison')}><KpiRow v3={v3} /></ErrorBoundary>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} dir={null} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="spark" title={LATE_BY_HOUR_TITLE} v3={v3} data={data} band={band} dir={null} allOnly /></ErrorBoundary>
      <p className="mt-8"><ArrowLink href="?view=analysis" onClick={(e: React.MouseEvent) => { e.preventDefault(); toFull(''); }}>{LIVE_FULL_REPORT_VIEW}</ArrowLink></p>
    </>
  );
  return (
    <>
      <ErrorBoundary label={bad('The week comparison')}><KpiRow v3={v3} /></ErrorBoundary>
      <div className="mt-8 border-t border-[var(--border-primary)] pt-2">
        <p className="mt-3 text-sm text-[var(--text-muted)]">{LIVE_DIRECTION_PICK_NOTE}</p>
        {filters}
      </div>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} dir={dir} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad(TRIP_TIME_LABEL)}><RunTimeSection v3={v3} band={band} dir={dir} detail="brief" /></ErrorBoundary>
      <ErrorBoundary label={bad(LATE_BY_HOUR_TITLE)}><LateByHourSection chart="spark" title={LATE_BY_HOUR_TITLE} v3={v3} data={data} band={band} dir={dir} /></ErrorBoundary>
      <WorstStopsSection v3={v3} data={data} dir={dir} uncertain={uncertain} limit={5} columns="compact" title={LATE_STOPS_TITLE} boundary={bad('The stop list')}
        footerLink={{ text: LIVE_EVERY_STOP_LINK, href: '?view=analysis#b2', onClick: () => toFull('b2') }} />
    </>
  );
}
