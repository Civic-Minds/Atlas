import { useState, type ReactNode } from 'react';
import { periodKeyForHour } from '../../../../shared/config';
import { healthyCounts, healthyDatesOf, healthyLateByHour, type DashboardBand, type DashboardBandData, type LiveV3 } from '../../../../shared/liveDashboard';
import { lateCount, lateHourLine, LATE_BY_HOUR_TITLE, LATE_THRESHOLD } from '../../../../shared/liveWording';
import { TILE } from '../../../pageStyles';
import { liveChartHours, type HourHover } from '../../../utils/sparklinePeriods';
import { daysCountedText, lateForDays, type DayKind } from '../../../utils/liveKpi';
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

/**
 * The late-by-hour figures for one kind of day, narrowed to a direction when `dir` is set: the one place they are read,
 * so every surface draws the same numbers. They count only this week's days with good recordings, the same days as the
 * tiles. A direction's figures and a file without per-day figures keep the all-days counts (the analysis stores those
 * only as totals).
 */
export function lateByHourModel(v3: LiveV3, data: DashboardBandData, dir: number | null) {
  const healthy = healthyDatesOf(v3);
  const blockOf = (d: DayKind) => data.adherence.timepoints[d];
  const countsFor = (d: DayKind): { n: number; lateShare: number; earlyShare: number } | null => {
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
export const routeLateOverall = (v3: LiveV3): number | null => healthyCounts(v3.bands.all.adherence.timepoints.all.byDate, healthyDatesOf(v3), 'all')?.lateShare ?? null;

/** The Yesterday view's figures for one day, in place of the week's. */
export interface OneDay { label: string; late: { share: number; n: number; days: number } | null; hours: HourValue[] }

type MiniProps = { chart: 'mini'; hours: readonly HourValue[]; band: DashboardBand; overall: number | null };
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

interface DayChart { kind: string; label: string; late: { share: number; n: number; days: number } | null; hours: HourValue[] }

/**
 * The one late-by-hour chart: late-share bars coloured by the strip's three steps on a % axis, the departures in a thin
 * band under them, and the times of day named under the hours. A row of charts shares one scale, one axis and one hover,
 * so hovering an hour or a time of day marks the same one in each.
 */
function ChartRow({ cols, tall = false, withLabels = true, showNote, daysTitle }: { cols: DayChart[]; tall?: boolean; withLabels?: boolean; showNote: boolean; daysTitle?: string }) {
  const [hover, setHover] = useState<HourHover | null>(null);
  const max = Math.max(0.1, ...cols.flatMap(c => c.hours.filter(h => h.n >= MIN_N).map(h => h.value)));
  const scale = { min: 0, max: Math.ceil(max * 10) / 10 };
  const axis = liveChartHours(h => cols.some(cc => (cc.hours.find(x => x.hour === h)?.n ?? 0) >= MIN_N));
  return (
    <>
      <div className={`mt-4 grid gap-x-8 gap-y-6 ${cols.length > 1 ? 'md:grid-cols-3' : ''}`}>
        {cols.map(c => {
          return (
            <div key={c.kind} className="min-w-0">
              {!withLabels && cols.length > 1 && <div className="text-sm font-bold">{c.label}</div>}
              {withLabels && (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-black">{c.label}</h3>
                    <span className="text-sm text-[var(--text-dim)]" title={daysTitle}>{c.late ? `${c.late.days} ${c.late.days === 1 ? 'day' : 'days'}` : ''}</span>
                  </div>
                  {c.late && c.late.n > 0 && <div className="mt-1 text-2xl font-black tracking-tight" title={`${c.late.n.toLocaleString()} departures`}>{pct(c.late.share)} <span className="text-sm font-bold text-[var(--text-muted)]">late</span></div>}
                </>
              )}
              {c.late && c.late.n > 0 ? (
                <div className="mt-2">
                  {c.hours.length ? (
                    <HourSpark departures yAxis periodBand barColor={lateShareColor} hover={hover} onHover={setHover} height={tall ? 120 : undefined} hoverLine={(t, v) => lateHourLine(t, lateCount(v.value, v.n), v.n)} values={c.hours} hours={axis} scale={scale} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
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
    return { kind, label, late, hours: m.sparkHours(kind, band) };
  });
  return (
    <section aria-labelledby="dash-days" className="mt-10">
      <SectionTitle id="dash-days">{title}</SectionTitle>
      <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
        How often trips leave the end of the line {LATE_THRESHOLD}, by kind of day and the hour they start.
        {dir != null && ' Both directions: this view is not split by direction yet.'}
      </p>
      <ChartRow cols={cols} tall={allOnly} showNote={!allOnly} daysTitle={oneDay || !v3.weekly ? undefined : daysCountedText(v3.weekly) ?? undefined} />
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={TILE}>
      <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-dim)]">{sub}</div>
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
    return { kind, label, late: c && c.n > 0 ? { share: c.lateShare, n: c.n, days: 0 } : null, hours: m.sparkHours(kind, 'all') };
  });
  return (
    <>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Share of trips that left the end of the line {LATE_THRESHOLD}.</p>
      <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
        {DAYS.map(([k, label]) => {
          const c = m.countsFor(k);
          return c && c.n > 0
            ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} />
            : <Tile key={k} label={label} value="–" sub="too few departures" />;
        })}
      </div>
      <h3 className="mt-6 text-base font-black">By hour of the day</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">How many departures are late in each hour.</p>
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
  const col: DayChart = { kind: day, label, late: { share: c.lateShare, n: c.n, days: 0 }, hours: m.sparkHours(day, band) };
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className={TILE}>
        <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()} · {pct(c.earlyShare)} ahead</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">{LATE_THRESHOLD}</div>
      </div>
      <div className="min-w-0"><ChartRow cols={[col]} withLabels={false} showNote /></div>
    </div>
  );
}

/** The tool panel's card: late share by hour over the whole 5am-4am day, the chosen time of day shaded. */
function Mini({ hours, band, overall }: Omit<MiniProps, 'chart'>) {
  if (!hours.length) return null;
  const max = Math.max(0.1, ...hours.filter(h => h.n >= 30).map(h => h.value));
  return (
    <Widget title={LATE_BY_HOUR_TITLE} size="medium">
      <HourSpark
        barColor={lateShareColor} height={24} values={hours} scale={{ min: 0, max: Math.ceil(max * 10) / 10 }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
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
  if (props.chart === 'mini') return <Mini hours={props.hours} band={props.band} overall={props.overall} />;
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
