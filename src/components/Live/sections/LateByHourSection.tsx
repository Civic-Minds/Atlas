import { useState, type ReactNode } from 'react';
import { periodKeyForHour } from '../../../../shared/config';
import { healthyCounts, healthyDatesOf, healthyLateByHour, isWeekendDate, type DashboardBand, type DashboardBandData, type LiveV3 } from '../../../../shared/liveDashboard';
import { excludingText, lateCount, lateHourLine, leftOutReason, LATE_BY_HOUR_TITLE, LATE_THRESHOLD } from '../../../../shared/liveWording';
import { TILE } from '../../../pageStyles';
import { liveChartHours, type HourHover } from '../../../utils/sparklinePeriods';
import { lateForDays, type DayKind } from '../../../utils/liveKpi';
import ErrorBoundary from '../../ErrorBoundary';
import HourSpark, { type HourValue } from '../../charts/HourSpark';
import LegendItem from '../../ui/LegendItem';
import { SectionTitle } from '../../ui/PageTitle';
import Widget from '../tool/Widget';
import { LATE_SHARE_SWATCH, lateShareColor } from '../lateShare';
import Section from './Section';
import { DAYS, pct } from './figures';

/** Fewer departures than this and an hour's bar is faded. */
const MIN_N = 30;
/** A figure resting on fewer good days than this reads as thin: dimmed, with the tile's hover text. */
export const MIN_GOOD_DAYS = 3;
export const THIN_HINT = 'Few measurements: treat with care.';
/** The top of a row's shared scale: the highest bar among hours with enough departures, at least 10%, rounded up to a tenth. */
export const rowMax = (hours: readonly HourValue[]): number => Math.ceil(Math.max(0.1, ...hours.filter(h => h.n >= MIN_N).map(h => h.value)) * 10) / 10;

/** The days of the week the figures are for (the days counted are some of these). */
const windowDatesOf = (v3: LiveV3): string[] => v3.weekly?.thisWeek.dates ?? v3.window.dates;

/** The days of this kind (all, weekdays or weekends) the figures leave out, as dates. */
export const leftOutDays = (v3: LiveV3, kind: DayKind): string[] => windowDatesOf(v3).filter(d => (kind === 'all' || (kind === 'weekend') === isWeekendDate(d)) && !healthyDatesOf(v3).includes(d));
/** "Excluding Oct 11" (the reason, naming the days, is the hover), or null when every day of this kind counts. */
export const leftOutOf = (v3: LiveV3, kind: DayKind): string | null => excludingText(leftOutDays(v3, kind));
/** The route's whole week (the planner's chart). */
export const routeLeftOut = (v3: LiveV3): string[] => leftOutDays(v3, 'all');
export const isThin = (days: number | undefined | null) => days != null && days > 0 && days < MIN_GOOD_DAYS;

/**
 * The late-by-hour figures for one kind of day, narrowed to a direction when `dir` is set: the one place they are read,
 * so every surface draws the same numbers. They count only this week's days with good recordings, the same days as the
 * tiles. A direction's figures and a file without per-day figures keep the all-days counts (the analysis stores those
 * only as totals).
 */
export function lateByHourModel(v3: LiveV3, data: DashboardBandData, dir: number | null) {
  const healthy = healthyDatesOf(v3);
  const blockOf = (d: DayKind) => data.adherence.timepoints[d];
  const countsFor = (d: DayKind): { n: number; lateShare: number; earlyShare: number; days?: number } | null => {
    const b = blockOf(d);
    if (dir != null) return b.byDirection[String(dir)] ?? null;
    // A file with no per-date counts keeps the totals.
    return b.byDate.length ? healthyCounts(b.byDate, healthy, d) : b.overall;
  };
  const sparkHours = (d: DayKind, band: DashboardBand): HourValue[] => (healthyLateByHour(v3, d) ?? blockOf(d).byHour).filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));
  return { blockOf, countsFor, sparkHours };
}

/** The tool panel's hours: the whole route, good days, every hour with departures. */
export const routeLateHours = (v3: LiveV3): HourValue[] => lateByHourModel(v3, v3.bands.all, null).sparkHours('all', 'all');

/** The route's overall late share, good days, all times of day. */
/** Good days behind the route's late figures. */
export const routeLateDays = (v3: LiveV3): number => healthyCounts(v3.bands.all.adherence.timepoints.all.byDate, healthyDatesOf(v3), 'all')?.days ?? 0;


export const routeLateOverall = (v3: LiveV3): number | null => healthyCounts(v3.bands.all.adherence.timepoints.all.byDate, healthyDatesOf(v3), 'all')?.lateShare ?? null;

/** The Yesterday view's figures for one day, in place of the week's. */
export interface OneDay { label: string; late: { share: number; n: number; days: number } | null; hours: HourValue[] }

type MiniProps = { chart: 'mini'; hours: readonly HourValue[]; band: DashboardBand; overall: number | null; /** Good days behind the figure; fewer than 3 dims it. */ days?: number; /** Bar area height in px. */ height?: number; /** What the figures cover, before the days counted ("both directions"). */ scope?: string; /** The days left out, if any. */ leftOut?: string[] };
type Props = {
  /**
   * `spark` is the dashboard's line chart per kind of day (`allOnly` keeps All days; `oneDay` shows one day);
   * `bars` is the stacked Ahead / On time / Late bars: for the three kinds of day when `day` is not set (Full
   * analysis), for that one day with a tile (Explore, which filters hours by `band` and may put `before` above);
   * `mini` is the tool panel's one-line chart with the time of day shaded.
   */
  chart: 'spark' | 'bars';
  v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null;
  title?: string; id?: string; shrink?: boolean; boundary?: string; before?: ReactNode;
  day?: DayKind; allOnly?: boolean; oneDay?: OneDay;
};

interface DayChart { kind: string; label: string; late: { share: number; n: number; days: number } | null; hours: HourValue[]; /** Rests on fewer than 3 good days. */ thin?: boolean; /** The days of this kind left out, if any. */ leftOut?: string[] }

/**
 * The one late-by-hour chart: late-share bars coloured by the strip's three steps on a % axis, the departures in a thin
 * band under them, and the times of day named under the hours. A row of charts shares one scale, one axis and one hover,
 * so hovering an hour or a time of day marks the same one in each.
 */
function ChartRow({ cols, tall = false, withLabels = true, showNote }: { cols: DayChart[]; tall?: boolean; withLabels?: boolean; showNote: boolean }) {
  const [hover, setHover] = useState<HourHover | null>(null);
  // One scale for the row, set by the bars with enough departures: a thin hour that runs higher is capped at the top of its chart (marked), so it cannot flatten the others.
  const max = rowMax(cols.flatMap(c => c.hours));
  const scale = { min: 0, max };
  const axis = liveChartHours(h => cols.some(cc => (cc.hours.find(x => x.hour === h)?.n ?? 0) >= MIN_N));
  return (
    <>
      <div className={`mt-4 grid gap-x-8 gap-y-6 ${cols.length > 1 ? 'md:grid-cols-3' : ''}`}>
        {cols.map(c => {
          return (
            <div key={c.kind} className={`min-w-0 ${c.thin ? 'opacity-60' : ''}`} title={c.thin ? THIN_HINT : undefined}>
              {!withLabels && cols.length > 1 && <div className="text-sm font-bold">{c.label}</div>}
              {withLabels && (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-black">{c.label}</h3>
                    <span className="text-sm text-[var(--text-dim)]" title={leftOutReason(c.leftOut ?? []) ?? undefined}>{excludingText(c.leftOut ?? []) ?? ''}</span>
                  </div>
                  {c.late && c.late.n > 0 && <div className="mt-1 text-2xl font-black tracking-tight" title={`${c.late.n.toLocaleString()} departures`}>{pct(c.late.share)} <span className="text-sm font-bold text-[var(--text-muted)]">late</span></div>}
                </>
              )}
              {c.late && c.late.n > 0 ? (
                <div className="mt-2">
                  {c.hours.length ? (
                    <HourSpark departures yAxis periodBand idleText={c.thin ? THIN_HINT : undefined} barColor={lateShareColor} hover={hover} onHover={setHover} height={tall ? 120 : undefined} hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)} values={c.hours} hours={axis} scale={scale} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
                      ariaLabel={`${c.label}: share of departures late by hour of the day, ${pct(c.late.share)} late overall.`} />
                  ) : <p className="text-sm text-[var(--text-muted)]">No departures in this part of the day.</p>}
                </div>
              ) : withLabels ? <p className="mt-1 text-sm text-[var(--text-muted)]">No {c.label.toLowerCase()} with good recordings this week.</p> : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <LegendItem color={LATE_SHARE_SWATCH}>Late %</LegendItem>
        <LegendItem color="var(--text-dim)" swatchClassName="opacity-50">Departures</LegendItem>
      </div>
      {showNote && <p className="mt-2 text-xs text-[var(--text-dim)]">Faded bars are based on fewer than {MIN_N} departures. The percentages count only days with good recordings, as the tiles do.</p>}
    </>
  );
}

function Spark({ v3, data, band, dir, allOnly = false, oneDay, title }: Props & { title: string }) {
  const m = lateByHourModel(v3, data, dir);
  const healthy = healthyDatesOf(v3);
  const cols: DayChart[] = oneDay ? [{ kind: 'all', label: oneDay.label, late: oneDay.late, hours: oneDay.hours }] : DAYS.filter(([kind]) => !allOnly || kind === 'all').map(([kind, label]) => {
    const late = lateForDays(m.blockOf(kind).byDate, healthy, kind);
    return { kind, label, late, hours: m.sparkHours(kind, band), thin: !oneDay && isThin(late?.days), leftOut: oneDay ? [] : leftOutDays(v3, kind) };
  });
  return (
    <section aria-labelledby="dash-days" className="mt-10">
      <SectionTitle id="dash-days">{title}</SectionTitle>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        How often trips leave the end of the line {LATE_THRESHOLD}, by kind of day and the hour they start.
        {dir != null && ' Both directions: this view is not split by direction yet.'}
      </p>
      <ChartRow cols={cols} tall={allOnly} showNote={!allOnly} />
    </section>
  );
}

function Tile({ label, value, sub, thin = false }: { label: string; value: string; sub: string; thin?: boolean }) {
  return (
    <div className={`${TILE} ${thin ? 'opacity-60' : ''}`} title={thin ? THIN_HINT : undefined}>
      <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-dim)]">{sub}</div>
      {thin && <div className="mt-1 text-xs text-[var(--text-dim)]">{THIN_HINT}</div>}
    </div>
  );
}

/** Full analysis: a tile for each kind of day, then the shared chart row. */
function BarsAll({ v3, data, dir }: { v3: LiveV3; data: DashboardBandData; dir: number | null }) {
  const m = lateByHourModel(v3, data, dir);
  const all = m.countsFor('all');
  if (!(all && all.n > 0)) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  const cols: DayChart[] = DAYS.map(([kind, label]) => {
    const c = m.countsFor(kind);
    return { kind, label, late: c && c.n > 0 ? { share: c.lateShare, n: c.n, days: c.days ?? 0 } : null, hours: m.sparkHours(kind, 'all'), thin: isThin(c?.days) };
  });
  return (
    <>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Share of trips that left the end of the line {LATE_THRESHOLD}.</p>
      <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
        {DAYS.map(([k, label]) => {
          const c = m.countsFor(k);
          return c && c.n > 0
            ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} thin={isThin(c.days)} />
            : <Tile key={k} label={label} value="–" sub="too few departures" />;
        })}
      </div>
      <h3 className="mt-6 text-base font-black">By hour of the day</h3>
      <ChartRow cols={cols} withLabels={false} showNote />
    </>
  );
}

/** Explore: the chosen kind of day, the time of day filter applied, with a tile that also names the lateness threshold. */
function BarsOne({ v3, data, band, dir, day }: { v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; day: DayKind }) {
  const m = lateByHourModel(v3, data, dir);
  const c = m.countsFor(day);
  const label = DAYS.find(([k]) => k === day)![1];
  if (!c || c.n === 0) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  const col: DayChart = { kind: day, label, late: { share: c.lateShare, n: c.n, days: c.days ?? 0 }, hours: m.sparkHours(day, band), thin: isThin(c.days) };
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className={`${TILE} ${isThin(c.days) ? 'opacity-60' : ''}`} title={isThin(c.days) ? THIN_HINT : undefined}>
        <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()} · {pct(c.earlyShare)} ahead</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">{LATE_THRESHOLD}</div>
        {isThin(c.days) && <div className="mt-1 text-xs text-[var(--text-dim)]">{THIN_HINT}</div>}
      </div>
      <div className="min-w-0"><ChartRow cols={[col]} withLabels={false} showNote /></div>
    </div>
  );
}

/** The tool panel's card: late share by hour over the whole 5am-4am day, the chosen time of day shaded. */
function Mini({ hours, band, overall, days, leftOut, height = 24, scope }: Omit<MiniProps, 'chart'>) {
  if (!hours.length) return null;
  // The bars fill the chart's height relative to its own tallest hour, which is labelled.
  const max = Math.max(0.01, ...hours.filter(h => h.n >= 30).map(h => h.value));
  return (
    <Widget title={LATE_BY_HOUR_TITLE} size="medium" className={isThin(days) ? 'opacity-60' : ''} hint={isThin(days) ? THIN_HINT : undefined} action={leftOut?.length ? <span className="shrink-0 text-xs text-[var(--text-dim)]" title={leftOutReason(leftOut) ?? undefined}>{excludingText(leftOut)}</span> : undefined}>
      <HourSpark
        idleText={isThin(days) ? THIN_HINT : scope} barColor={lateShareColor} height={height} peakLabel values={hours} scale={{ min: 0, max }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
        hours={liveChartHours(h => hours.some(x => x.hour === h && x.n >= 30))}
        shade={band === 'all' ? undefined : h => periodKeyForHour(h) === band}
        hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)}
        ariaLabel={`Share of departures late by hour of the day${overall != null ? `, ${pct(overall)} late overall` : ''}.`}
      />
    </Widget>
  );
}

/**
 * Late by hour: how often departures are late, hour by hour. One component for every surface; `chart` picks how it
 * is drawn (see Props). The title is the caller's (the surfaces word it differently).
 */
export default function LateByHourSection(props: Props | MiniProps): ReactNode {
  if (props.chart === 'mini') return <Mini hours={props.hours} band={props.band} overall={props.overall} days={props.days} leftOut={props.leftOut} height={props.height} scope={props.scope} />;
  const { chart, v3, data, band, dir, title = LATE_BY_HOUR_TITLE, id, shrink, boundary, before, day } = props;
  if (chart === 'spark') return <Spark {...props} title={title} />;
  const body = day ? <BarsOne v3={v3} data={data} band={band} dir={dir} day={day} /> : <BarsAll v3={v3} data={data} dir={dir} />;
  return (
    <Section id={id ?? 'b1'} title={title} shrink={shrink}>
      {before}
      {boundary ? <ErrorBoundary label={boundary}>{body}</ErrorBoundary> : body}
    </Section>
  );
}
