import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { periodKeyForHour } from '../shared/config';
import { dateRangeText, rankStops, weekDailyValues, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../shared/liveDashboard';
import { kpiTiles, lateForDays, NOISE_RULE, weekCaption, type DayKind, type Kpi } from './utils/liveKpi';
import ErrorBoundary from './components/ErrorBoundary';
import DataTable from './components/ui/DataTable';
import HourSpark, { type HourValue } from './components/charts/HourSpark';
import RouteStrip, { routeStripFromV3, type RouteStripMode } from './components/Live/RouteStrip';
import Pill from './components/ui/Pill';
import { syncUrlParams } from './utils/syncUrlParams';
import { useMediaQuery } from './hooks/useMediaQuery';
import { PAGE_ACTION, TILE } from './pageStyles';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', '−');
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;
const MIN_N = 30;
const BAND_WORDS: Record<DashboardBand, string> = { all: 'all day', amPeak: 'in the AM peak', midday: 'at midday', pmPeak: 'in the PM peak', evening: 'in the evening' };
const DAY_KINDS: [DayKind, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];

const dirsOf = (v3: LiveV3, dir: number | null) => Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b).filter(d => dir == null || d === dir);

/**
 * One plain line at the top, for the whole week, both directions and all day (the same figures as the tiles): how late
 * it ran, and where delay and bunching build up, if anywhere.
 */
export function summaryText(v3: LiveV3, title: string): string {
  const w = v3.weekly?.thisWeek;
  const all = v3.bands.all;
  const dirs = dirsOf(v3, null);
  const label = (d: number) => v3.directionLabels[String(d)].toLowerCase();
  const range = w?.healthyDates.length ? dateRangeText(w.healthyDates[0], w.healthyDates[w.healthyDates.length - 1]) : null;
  const lead = w?.late ? `${title}, ${range}: ${pct(w.late.share)} of departures were late.` : `${title}: too few departures to say how late it ran.`;
  const delays = dirs.flatMap(d => { const b = all.buildup.find(x => x.directionId === d); return b?.kind === 'forms' && b.forms ? [`${label(d)} near ${b.forms.toName}`] : []; });
  const bunch = dirs.flatMap(d => { const b = v3.bunching.find(x => x.directionId === d)?.bands.all; return b?.kind === 'forms' && b.forms ? [`${label(d)} near ${b.forms.toName}`] : []; });
  const delaySentence = delays.length ? `Delay builds up ${delays.join(' and ')}.` : 'Delay builds up gradually, with no single place it starts.';
  const bunchSentence = bunch.length ? `Bunching starts ${bunch.join(' and ')}.` : 'Bunching grows gradually along the route, with no single place it starts.';
  return `${lead} ${delaySentence} ${bunchSentence}`;
}

function Delta({ k }: { k: Kpi }) {
  if (!k.delta) return <span className="text-xs text-[var(--text-dim)]">No comparison with last week</span>;
  const tone = k.delta.tone === 'better' ? 'text-[var(--status-positive-text)]' : k.delta.tone === 'worse' ? 'text-[var(--status-negative-text)]' : 'text-[var(--text-muted)]';
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className={`whitespace-nowrap font-bold ${tone}`} aria-label={k.delta.spoken} title={k.delta.spoken}>{k.delta.text}</span>
      {k.lastWeekText && <span className="whitespace-nowrap text-[var(--text-dim)]">last week {k.lastWeekText}</span>}
    </span>
  );
}

function KpiRow({ v3 }: { v3: LiveV3 }) {
  const w = v3.weekly;
  if (!w) return <p className="mt-4 text-sm text-[var(--text-muted)]">This week against last week is not in this analysis file. Rebuild it with npm run live:analyze.</p>;
  const tiles = kpiTiles(w, weekDailyValues(v3));
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
      <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-dim)]">{weekCaption(w)} {NOISE_RULE}</p>
    </section>
  );
}

/** Late share and lateness by hour for all days, weekdays and weekends, side by side on one scale. */
function Days({ v3, data, band, dir }: { v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null }) {
  const healthy = v3.weekly?.thisWeek.healthyDates ?? v3.window.dates;
  const cols = DAY_KINDS.map(([kind, label]) => {
    const block = data.adherence.timepoints[kind];
    const late = lateForDays(block.byDate, healthy, kind);
    const hours: HourValue[] = block.byHour.filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));
    return { kind, label, late, hours };
  });
  const max = Math.max(0.1, ...cols.flatMap(c => c.hours.filter(h => h.n >= MIN_N).map(h => h.value)));
  const scale = { min: 0, max: Math.ceil(max * 10) / 10 };
  return (
    <section aria-labelledby="dash-days" className="mt-10">
      <h2 id="dash-days" className="text-xl font-black tracking-tight">Late, by day and hour</h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        Share of departures 5.5+ minutes late {BAND_WORDS[band]}, at stops where the timetable gives a time.
        {dir != null && ' Both directions: this view is not split by direction yet.'} Bars run from 0 to {pct(scale.max)}.
      </p>
      <div className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-3">
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
                    <HourSpark values={c.hours} scale={scale} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
                      ariaLabel={`${c.label}: share of departures late by hour of the day, ${pct(c.late.share)} late overall.`} />
                  ) : <p className="text-sm text-[var(--text-muted)]">No departures in this part of the day.</p>}
                </div>
              </>
            ) : <p className="mt-1 text-sm text-[var(--text-muted)]">No {c.label.toLowerCase()} with good recordings this week.</p>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">Faded bars are based on fewer than {MIN_N} departures. The percentages count only days with good recordings, as the tiles do; the hourly bars count every day of the week.</p>
    </section>
  );
}

/** Trip time against the timetable by the hour a trip starts, one small chart per direction on one scale. */
function TripTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  const groups = dirsOf(v3, dir).map(d => ({
    d,
    hours: (rt?.byHour[String(d)] ?? []).filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)).map(h => ({ hour: h.hour, value: h.overMin, n: h.n })),
    band: rt?.bands[band]?.[String(d)] ?? null,
  }));
  const shown = groups.flatMap(g => g.hours.filter(h => h.n >= 5).map(h => h.value));
  const lim = Math.max(2, ...shown.map(Math.abs));
  const scale = { min: Math.min(0, ...shown) < 0 ? -lim : 0, max: lim };
  return (
    <div className="min-w-0 lg:col-span-2">
      <h2 className="text-xl font-black tracking-tight">Trip time against the timetable</h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">Minutes longer (above the line) or shorter (below) than scheduled, end to end, by the hour the trip starts. Bars run from {mins(scale.min)} to {mins(scale.max)}.</p>
      <div className={`mt-4 grid gap-x-8 gap-y-6 ${groups.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {groups.map(g => (
          <div key={g.d} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-black">{v3.directionLabels[String(g.d)]}</h3>
              {g.band && <span className="whitespace-nowrap text-sm text-[var(--text-dim)]">{g.band.n.toLocaleString()} trips</span>}
            </div>
            {g.band ? (
              <div className="mt-1 text-2xl font-black tracking-tight">{Math.round(g.band.typicalMin)} min <span className="text-sm font-bold text-[var(--text-muted)]">typical, timetable {Math.round(g.band.scheduledMin)}</span></div>
            ) : null}
            <div className="mt-2">
              {g.hours.length > 1 ? (
                <HourSpark values={g.hours} scale={scale} minN={5} color="var(--text-muted)" format={mins} unit="trips" valueHeader="Against the timetable"
                  ariaLabel={`${v3.directionLabels[String(g.d)]}: trip time against the timetable by the hour the trip starts.`} />
              ) : <p className="text-sm text-[var(--text-muted)]">No trip was measured from end to end for this choice.</p>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--text-dim)]">Faded bars are based on fewer than 5 trips. Only full trips on each direction's main route count.</p>
    </div>
  );
}

/** Each direction as a line of stops coloured by typical delay or by bunching, with where it starts marked. */
function AlongRoute({ v3, band, dir, uncertain }: { v3: LiveV3; band: DashboardBand; dir: number | null; uncertain: UncertainStart[] }) {
  const [mode, setMode] = useState<RouteStripMode>(() => (new URLSearchParams(window.location.search).get('strip') === 'bunching' ? 'bunching' : 'delay'));
  useEffect(() => { syncUrlParams({ strip: mode === 'bunching' ? 'bunching' : null }); }, [mode]);
  const all = useMemo(() => dirsOf(v3, dir).map(d => routeStripFromV3(v3, d, band, uncertain)).filter(d => d.stops.length > 1), [v3, dir, band, uncertain]);
  // Phones show one direction at a time, so the two lines are not stacked down a long page.
  const phone = useMediaQuery('(max-width: 479px)');
  const [phoneDir, setPhoneDir] = useState(0);
  const pickable = phone && all.length > 1;
  const dirs = pickable ? [all[Math.min(phoneDir, all.length - 1)]] : all;
  return (
    <section aria-labelledby="dash-strip" className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="dash-strip" className="text-xl font-black tracking-tight">Along the route</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Colour the stops by">
          <Pill size="segment" selected={mode === 'delay'} onClick={() => setMode('delay')}>Delay</Pill>
          <Pill size="segment" selected={mode === 'bunching'} onClick={() => setMode('bunching')}>Bunching</Pill>
        </div>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        {mode === 'delay' ? 'Each stop coloured by how late cars typically leave it' : 'Each stop coloured by the share of gaps between cars that are too close or too far apart'} {BAND_WORDS[band]}. Hover or tap a stop for its figures.
      </p>
      {pickable && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Direction shown">
          {all.map((d, i) => <Pill key={d.directionId} size="segment" selected={i === Math.min(phoneDir, all.length - 1)} onClick={() => setPhoneDir(i)}>{d.label}</Pill>)}
        </div>
      )}
      {dirs.length ? (
        <div className="mt-4 grid gap-x-8 gap-y-8">
          {dirs.map(d => (
            <div key={d.directionId} className="min-w-0">
              {!pickable && <h3 className="text-base font-black">{d.label}</h3>}
              <RouteStrip className="mt-2" stops={d.stops} mode={mode} directionLabel={d.label} delaysStart={d.delaysStart} bunchingForms={d.bunchingForms} />
            </div>
          ))}
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stops were measured for this choice.</p>}
    </section>
  );
}

function WorstStops({ v3, data, dir, uncertain, toFull }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[]; toFull: (hash: string) => void }) {
  const top = useMemo(() => rankStops(data.stops, dir, uncertain).slice(0, 5), [data, dir, uncertain]);
  return (
    <div className="min-w-0">
      <h2 className="text-xl font-black tracking-tight">Stops most often late</h2>
      {top.length ? (
        <div className="mt-3">
          <DataTable
            caption="The five stops with the highest share of late departures"
            rows={top}
            rowKey={s => `${s.stopId}-${s.directionId}`}
            columns={[
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => (
                <span title={`${s.n.toLocaleString()} departures, typically ${mins(s.medianMin)}`}>
                  {s.name}
                  {dir == null && <span className="block text-xs text-[var(--text-dim)]">{v3.directionLabels[String(s.directionId)]}</span>}
                </span>
              ) },
              { key: 'late', header: 'Late', className: 'w-16 whitespace-nowrap text-right', cell: s => <span title={`${s.n.toLocaleString()} departures`}>{pct(s.lateShare)}</span> },
            ]}
          />
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>}
      <p className="mt-3"><a href="?view=analysis#b2" onClick={e => { e.preventDefault(); toFull('b2'); }} className={PAGE_ACTION}>Every stop, in Full analysis</a></p>
    </div>
  );
}

export default function LiveDashboardView({ v3, data, band, dir, uncertain, title, filters, toFull }: {
  v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; uncertain: UncertainStart[]; note: string | null; title: string;
  /** The direction and time-of-day pills: they sit below the week figures, above the parts they change. */
  filters: ReactNode;
  toFull: (hash: string) => void;
}) {
  const summary = useMemo(() => { try { return summaryText(v3, title); } catch { return null; } }, [v3, title]);
  const bad = (what: string) => `${what} could not be drawn: the analysis file may be from an older version. Rebuild it with npm run live:analyze.`;
  return (
    <>
      {summary && <p className="mt-6 max-w-3xl text-lg font-bold leading-7">{summary}</p>}
      <ErrorBoundary label={bad('The week comparison')}><KpiRow v3={v3} /></ErrorBoundary>
      <div className="mt-8 border-t border-[var(--border-primary)] pt-2">
        <p className="mt-3 text-sm text-[var(--text-muted)]">Everything below follows these choices. The figures above are the whole week, both directions, all day.</p>
        {filters}
      </div>
      <ErrorBoundary label={bad('The route strip')}><AlongRoute v3={v3} band={band} dir={dir} uncertain={uncertain} /></ErrorBoundary>
      <ErrorBoundary label={bad('Late by day and hour')}><Days v3={v3} data={data} band={band} dir={dir} /></ErrorBoundary>
      <section className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-3" aria-label="Trip time and the stops most often late">
        <ErrorBoundary label={bad('Trip time')}><TripTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={bad('The stop list')}><WorstStops v3={v3} data={data} dir={dir} uncertain={uncertain} toFull={toFull} /></ErrorBoundary>
      </section>
    </>
  );
}
