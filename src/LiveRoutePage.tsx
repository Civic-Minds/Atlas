import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { FEATURES } from '../shared/config';
import {
  LINK_LABELS, bunchingSentence, freshness, buildupSentence, linkValueText, rankStops,
  type AdherenceBlock, type DashboardBunchingBand, type LiveDashboardResponse, type LiveV3,
} from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import Pill from './components/ui/Pill';
import LiveOffNotice from './components/LiveOffNotice';
import LineChart from './components/charts/LineChart';
import BarChart from './components/charts/BarChart';
import StackedBars from './components/charts/StackedBars';
import { PAGE_ACTION, TILE } from './pageStyles';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
const BANDS: [string, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mins = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 10) / 10} min`;

type Ready = Extract<LiveDashboardResponse, { status: 'ready' }>;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-black tracking-tight">{title}</h2>
      {children}
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

function Filters({ v3, day, setDay, dir, setDir }: { v3: LiveV3; day: Day; setDay: (d: Day) => void; dir: number | null; setDir: (d: number | null) => void }) {
  const dirs = Object.keys(v3.directionLabels).map(Number).sort();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label="Filters">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
        {DAYS.map(([k, label]) => <Pill key={k} size="segment" selected={day === k} onClick={() => setDay(k)}>{label}</Pill>)}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Direction">
        <Pill size="segment" selected={dir == null} onClick={() => setDir(null)}>Both directions</Pill>
        {dirs.map(d => <Pill key={d} size="segment" selected={dir === d} onClick={() => setDir(d)}>{v3.directionLabels[String(d)]}</Pill>)}
      </div>
    </div>
  );
}

/** B1: how well the route keeps to its timetable, at timepoints (where the timetable really schedules a time). */
function Adherence({ v3, day, dir }: { v3: LiveV3; day: Day; dir: number | null }) {
  const block: AdherenceBlock = v3.adherence.timepoints[day];
  const counts = dir == null ? block.overall : block.byDirection[String(dir)];
  const all = v3.adherence.allStops[day];
  const hours = block.byHour.filter(h => h.n >= 20);
  return (
    <Section id="b1" title="How well it keeps to its timetable">
      {counts && counts.n > 0 ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Tile label="Not late" value={pct(counts.notLateShare)} sub={`${counts.n.toLocaleString()} departures from timepoints`} />
            <Tile label={`Late (${v3.thresholds.lateAtOrAboveMin}+ min)`} value={pct(counts.lateShare)} sub={`${counts.late.toLocaleString()} of ${counts.n.toLocaleString()}`} />
            <Tile label="Left ahead of the timetable" value={pct(counts.earlyShare)} sub={`${Math.abs(v3.thresholds.earlyAtOrBelowMin)}+ min early; cars often wait to leave on time`} />
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
            Counted where the timetable really schedules a time (timepoints). Counting every stop, {pct(all.overall.lateShare)} of {all.overall.n.toLocaleString()} departures are late, but the times between timepoints are only interpolated.
          </p>
          <h3 className="mt-6 text-base font-black">By hour of the day</h3>
          <StackedBars
            ariaLabel="Share of departures ahead of the timetable, on time and late, by hour of the day"
            parts={[{ name: 'Ahead', color: 'var(--status-caution)' }, { name: 'On time', color: 'var(--status-positive)' }, { name: 'Late', color: 'var(--status-negative)' }]}
            columns={hours.map(h => ({ label: `${h.hour}:00`, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
          />
        </>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at timepoints for this choice.</p>}
    </Section>
  );
}

/** B3: where delays start. One chart per direction. */
function Buildup({ v3, dir }: { v3: LiveV3; dir: number | null }) {
  const rows = v3.buildup.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  return (
    <Section id="b3" title="Where delays start">
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
        Delay at each stop is how late the car left it compared with the timetable. A stretch where the delay grows by more than a minute in at least half of the runs is where delays start.
      </p>
      <div className={`mt-4 grid gap-6 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const stretches = b.stretches;
          const startIdx = b.start ? stretches.findIndex(s => s.fromStopId === b.start!.fromStopId && s.toStopId === b.start!.toStopId) : -1;
          const worst = [...stretches].sort((a, c) => c.medianAddedMin - a.medianAddedMin).slice(0, 5);
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <p className="mt-1 text-sm leading-6">{buildupSentence(label, b)}</p>
              <LineChart
                ariaLabel={`${label}: median delay along the route, with the 10th to 90th percentile range`}
                points={stretches.map(s => ({ label: s.toName, y: s.medianDelayMin, lo: s.p10DelayMin, hi: s.p90DelayMin, n: s.n }))}
                formatY={y => `${Math.round(y * 10) / 10}`}
                baseline={0}
                marks={startIdx >= 0 ? [{ index: startIdx, label: 'Delays start' }] : []}
                startLabel="Start of route"
                endLabel="End of route"
              />
              <p className="text-xs text-[var(--text-dim)]">Minutes late (line: median; band: 10th to 90th percentile).</p>
              <div className="mt-3 overflow-x-auto">
                <DataTable
                  caption={`${label}: the five stretches that add the most delay`}
                  rows={worst}
                  rowKey={s => `${s.fromStopId}-${s.toStopId}`}
                  columns={[
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, className: 'font-normal', cell: s => `${s.fromName} to ${s.toName}` },
                    { key: 'added', header: 'Added', cell: s => mins(s.medianAddedMin) },
                    { key: 'share', header: 'Runs', cell: s => `${pct(s.addedShare)} of ${s.n}` },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** B2: stops with the most delay, ranked by how often cars leave 5.5+ min late. */
function WorstStops({ v3, dir }: { v3: LiveV3; dir: number | null }) {
  const ranked = useMemo(() => rankStops(v3.stops, dir), [v3, dir]);
  const top = ranked.slice(0, 10);
  const name = (s: { name: string; directionId: number }) => (dir == null ? `${s.name} (${v3.directionLabels[String(s.directionId)]})` : s.name);
  return (
    <Section id="b2" title="Stops with the most delay">
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
        Stops ranked by the share of cars leaving {v3.thresholds.lateAtOrAboveMin}+ minutes late. Only stops with at least 30 departures are ranked; the median and 90th percentile sit beside it.
      </p>
      {top.length ? (
        <>
          <div className="mt-4">
            <BarChart
              ariaLabel="The ten stops where the most cars leave late"
              bars={top.map(s => ({ label: name(s), value: s.lateShare, valueText: `${pct(s.lateShare)} late of ${s.n.toLocaleString()}` }))}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            <DataTable
              caption="Stops ranked by late share"
              rows={top}
              rowKey={s => `${s.stopId}-${s.directionId}`}
              columns={[
                { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => name(s) },
                { key: 'late', header: 'Late', cell: s => pct(s.lateShare) },
                { key: 'median', header: 'Median', cell: s => mins(s.medianMin) },
                { key: 'p90', header: '90th percentile', cell: s => mins(s.p90Min) },
                { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
              ]}
            />
          </div>
        </>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>}
    </Section>
  );
}

/** B4: where and why bunching forms. "Linked to", never "caused by". */
function Bunching({ v3, dir }: { v3: LiveV3; dir: number | null }) {
  const [band, setBand] = useState('all');
  const rows = v3.bunching.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  return (
    <Section id="b4" title="Where bunching forms">
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">
        Bunching is cars arriving too close together (gaps under {Math.round(v3.thresholds.bunchedGapSec / 60)} minutes) or too far apart (more than twice the timetable's gap). The chart shows that share at each stop along the route; it forms where the share steps up and stays up.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Time of day">
        {BANDS.map(([k, label]) => <Pill key={k} size="segment" selected={band === k} onClick={() => setBand(k)}>{label}</Pill>)}
      </div>
      <div className={`mt-4 grid gap-6 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const data: DashboardBunchingBand | undefined = b.bands[band];
          if (!data) return null;
          const measured = data.stops.filter(s => s.n >= 30);
          const stretch = data.forms ?? data.biggestRise;
          const markIdx = stretch ? measured.findIndex(s => s.stopId === stretch.toStopId) : -1;
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <p className="mt-1 text-sm leading-6">{bunchingSentence(label, data)}</p>
              {measured.length > 1 && (
                <LineChart
                  ariaLabel={`${label}: share of gaps that are too short or too long, stop by stop`}
                  points={measured.map(s => ({ label: s.name, y: s.badShare, n: s.n }))}
                  formatY={y => pct(y)}
                  marks={markIdx >= 0 ? [{ index: markIdx, label: data.kind === 'forms' ? 'Forms here' : 'Biggest rise' }] : []}
                  startLabel="Start of route"
                  endLabel="End of route"
                />
              )}
              <p className="text-xs text-[var(--text-dim)]">Gaps off the timetable, by stop (stops with 30+ gaps).</p>
              {stretch && (
                <>
                  <h4 className="mt-3 text-sm font-black">{data.kind === 'forms' ? 'Linked to' : 'Near the biggest rise, linked to'}</h4>
                  <ul className="mt-1 space-y-1 text-sm">
                    {stretch.links.map(l => (
                      <li key={l.kind} className={l.linked ? '' : 'text-[var(--text-dim)]'}>
                        {l.linked ? 'Linked: ' : 'Not linked: '}{LINK_LABELS[l.kind]} ({linkValueText(l.kind, l.value)})
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-[var(--text-dim)]">Linked means it was measured near this stretch, not that it is the cause.</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Method({ data }: { data: Ready }) {
  const { v3 } = data;
  const [first, last] = [v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1]];
  return (
    <Section id="method" title="How this is measured">
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]">
        <li>Window: the last {v3.window.days} service days ({first} to {last}); {v3.totals.runs.toLocaleString()} runs and {v3.totals.stopPassages.toLocaleString()} stop departures. Built {data.generatedAt.slice(0, 10)}.</li>
        <li>{v3.method}</li>
        <li>Late means {v3.thresholds.lateAtOrAboveMin}+ minutes after the timetable; ahead means {Math.abs(v3.thresholds.earlyAtOrBelowMin)}+ minutes before it. These are the same limits the Live map uses.</li>
        <li>{pct(v3.swaps.rate)} of runs were on a trip number that did not fit their own timetable slot: {v3.swaps.reassigned} were matched to the slot that fit, {v3.swaps.dropped} were left out.</li>
        {data.replacementBuses && <li>This route is run by replacement buses in this timetable, so every figure describes the buses.</li>}
      </ul>
    </Section>
  );
}

export default function LiveRoutePage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(agency, route);
  const [day, setDay] = useState<Day>('all');
  const [dir, setDir] = useState<number | null>(null);
  if (!FEATURES.live) return <LiveOffNotice />;
  const title = `${agency.toUpperCase()} ${route}`;
  const back = <a href="/apps/live" className={`${PAGE_ACTION} mt-6`}>Open Live <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>;
  if (state.kind === 'loading') return <PageShell variant="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {title}…</p></PageShell>;
  if (state.kind === 'error') return <PageShell variant="wide"><h1 className="mt-24 text-3xl font-black tracking-tight">{title}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{state.reason}</p>{back}</PageShell>;
  const data = state.data;
  if (data.status !== 'ready') {
    return (
      <PageShell variant="wide">
        <h1 className="mt-24 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{data.reason}</p>
        {back}
      </PageShell>
    );
  }
  const { v3 } = data;
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}: how it is running</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Last {v3.window.days} days · {v3.totals.runs.toLocaleString()} runs · estimated from vehicle positions, not reported by the agency
            </p>
          </div>
          <a href="/apps/live" className={PAGE_ACTION}>View on Live map <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
        {(() => {
          const f = freshness(v3, route, Date.now());
          return <p className={`mt-2 text-sm ${f.stale ? 'font-bold text-[var(--status-caution-text)]' : 'text-[var(--text-muted)]'}`} role={f.stale ? 'status' : undefined}>{f.text}</p>;
        })()}
        {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        <Filters v3={v3} day={day} setDay={setDay} dir={dir} setDir={setDir} />
        <Adherence v3={v3} day={day} dir={dir} />
        <Buildup v3={v3} dir={dir} />
        <WorstStops v3={v3} dir={dir} />
        <Bunching v3={v3} dir={dir} />
        <Method data={data} />
      </article>
    </PageShell>
  );
}
