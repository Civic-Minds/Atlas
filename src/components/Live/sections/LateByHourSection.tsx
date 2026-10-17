import type { ReactNode } from 'react';
import { periodKeyForHour } from '../../../../shared/config';
import type { DashboardBand, DashboardBandData, LiveV3 } from '../../../../shared/liveDashboard';
import { lateCount, lateHourLine, LATE_BY_HOUR_TITLE } from '../../../../shared/liveWording';
import { TILE } from '../../../pageStyles';
import { liveChartHours } from '../../../utils/sparklinePeriods';
import { lateForDays, type DayKind } from '../../../utils/liveKpi';
import ErrorBoundary from '../../ErrorBoundary';
import HourBars from '../../charts/HourBars';
import HourSpark, { type HourValue } from '../../charts/HourSpark';
import LegendItem from '../../ui/LegendItem';
import { SectionTitle } from '../../ui/PageTitle';
import Widget from '../tool/Widget';
import Section from './Section';
import { DAYS, pct } from './figures';

/** Fewer departures than this and an hour's bar is faded. */
const MIN_N = 30;
const PARTS = [{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }];

/** The late-by-hour figures for one kind of day, narrowed to a direction when `dir` is set: the one place they are read, so every surface draws the same numbers. */
export function lateByHourModel(data: DashboardBandData, dir: number | null) {
  const blockOf = (d: DayKind) => data.adherence.timepoints[d];
  const countsFor = (d: DayKind) => { const b = blockOf(d); return dir == null ? b.overall : b.byDirection[String(dir)]; };
  const sparkHours = (d: DayKind, band: DashboardBand): HourValue[] => blockOf(d).byHour.filter(h => h.n > 0 && (band === 'all' || periodKeyForHour(h.hour) === band)).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n }));
  const barColumns = (d: DayKind, band: DashboardBand | null) => blockOf(d).byHour.filter(h => band == null || band === 'all' || periodKeyForHour(h.hour) === band).map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }));
  return { blockOf, countsFor, sparkHours, barColumns };
}

/** The tool panel's hours: the whole route, all days, every hour with departures. */
export const routeLateHours = (v3: LiveV3): HourValue[] => lateByHourModel(v3.bands.all, null).sparkHours('all', 'all');

/** The route's overall late share, all days and times of day. */
export const routeLateOverall = (v3: LiveV3): number | null => v3.bands.all.adherence.timepoints.all.overall?.lateShare ?? null;

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

function Spark({ v3, data, band, dir, allOnly = false, oneDay, title }: Props & { title: string }) {
  const m = lateByHourModel(data, dir);
  const healthy = v3.weekly?.thisWeek.healthyDates ?? v3.window.dates;
  const cols = oneDay ? [{ kind: 'all' as const, label: oneDay.label, late: oneDay.late, hours: oneDay.hours }] : DAYS.filter(([kind]) => !allOnly || kind === 'all').map(([kind, label]) => {
    const late = lateForDays(m.blockOf(kind).byDate, healthy, kind);
    return { kind, label, late, hours: m.sparkHours(kind, band) };
  });
  const max = Math.max(0.1, ...cols.flatMap(c => c.hours.filter(h => h.n >= MIN_N).map(h => h.value)));
  const scale = { min: 0, max: Math.ceil(max * 10) / 10 };
  return (
    <section aria-labelledby="dash-days" className="mt-10">
      <SectionTitle id="dash-days">{title}</SectionTitle>
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

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={TILE}>
      <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-black tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-dim)]">{sub}</div>
    </div>
  );
}

/** Full analysis: a tile and a stacked-bar chart for each kind of day. */
function BarsAll({ data, dir }: { data: DashboardBandData; dir: number | null }) {
  const m = lateByHourModel(data, dir);
  const all = m.countsFor('all');
  if (!(all && all.n > 0)) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  return (
    <>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Share of trips that left the end of the line more than 5 min late.</p>
      <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
        {DAYS.map(([k, label]) => {
          const c = m.countsFor(k);
          return c && c.n > 0
            ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} />
            : <Tile key={k} label={label} value="–" sub="too few departures" />;
        })}
      </div>
      <h3 className="mt-6 text-base font-black">By hour of the day</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">How many departures are ahead, on time or late in each hour. Hover over an hour to see its time of day.</p>
      <div className="mt-3 grid gap-6 md:grid-cols-3">
        {DAYS.map(([k, label]) => {
          const c = m.countsFor(k);
          const axis = liveChartHours(h => DAYS.some(([d]) => (m.blockOf(d).byHour.find(x => x.hour === h)?.n ?? 0) >= 30));
          return (
            <HourBars
              hoverLine={(t, c) => lateHourLine(t, lateCount(c.parts[2], c.n), c.n)}
              departures
              hours={axis}
              key={k}
              title={label}
              showKey={k === 'weekend'}
              ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${c ? pct(c.lateShare) : '–'} late overall.`}
              parts={PARTS}
              columns={m.barColumns(k, null)}
            />
          );
        })}
      </div>
    </>
  );
}

/** Explore: the chosen kind of day, the time of day filter applied, with a tile that also names the lateness threshold. */
function BarsOne({ v3, data, band, dir, day }: { v3: LiveV3; data: DashboardBandData; band: DashboardBand; dir: number | null; day: DayKind }) {
  const m = lateByHourModel(data, dir);
  const c = m.countsFor(day);
  const label = DAYS.find(([k]) => k === day)![1];
  if (!c || c.n === 0) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className={TILE}>
        <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()} · {pct(c.earlyShare)} ahead</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">{v3.thresholds.lateAtOrAboveMin}+ min</div>
      </div>
      <HourBars
        hoverLine={(t, c) => lateHourLine(t, lateCount(c.parts[2], c.n), c.n)}
        departures
        ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${pct(c.lateShare)} late overall.`}
        parts={PARTS}
        columns={m.barColumns(day, band)}
      />
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
        departures height={24} values={hours} scale={{ min: 0, max: Math.ceil(max * 10) / 10 }} color="var(--status-negative-text)" format={pct} unit="departures" valueHeader="Late"
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
  const body = day ? <BarsOne v3={v3} data={data} band={band} dir={dir} day={day} /> : <BarsAll data={data} dir={dir} />;
  return (
    <Section id={id ?? 'b1'} title={title} shrink={shrink}>
      {before}
      {boundary ? <ErrorBoundary label={boundary}>{body}</ErrorBoundary> : body}
    </Section>
  );
}
