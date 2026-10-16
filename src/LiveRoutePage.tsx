import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES, periodKeyForHour } from '../shared/config';
import {
  LINK_LABELS, branchFigures, branchRunTimeLine, runTimeStretchLabel, runTimeTakeaway, NOISE_RULE, bunchingSentence, buildupTakeaway, dateRangeText, deliveredSentence, extraWaitSentence, freshness, buildupSentence, linkValueText, rankStops, runningTimeSentence,
  type DashboardBand, type DashboardBandData, type DashboardBunchingBand, type LiveDashboardResponse, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { devOnly, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { SITE_URL } from '../shared/seo';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { isMajorStop, shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import SortableDataTable from './components/ui/SortableDataTable';
import Pill from './components/ui/Pill';
import LiveOffNotice from './components/LiveOffNotice';
import LiveDashboardView from './LiveDashboardView';
import LiveExplorePage from './LiveExplorePage';
import ProfileBars, { sharedScale, type ProfilePoint } from './components/charts/ProfileBars';
import HourBars from './components/charts/HourBars';
import { KpiRow } from './LiveDashboardView';
import { weekCaption } from './utils/liveKpi';
import RunTimeChart, { runTimeScale } from './components/charts/RunTimeChart';
import { TILE } from './pageStyles';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];
const MINUS = '−';

/** Stop names come upper-case or mixed from the feed; show them the way the map does. */
export function withNiceNames(v3: LiveV3): LiveV3 {
  const t = titleCase;
  const stretch = <S extends { fromName: string; toName: string }>(x: S | null): S | null => (x ? { ...x, fromName: t(x.fromName), toName: t(x.toName) } : x);
  const bandData = (b: DashboardBandData): DashboardBandData => ({
    ...b,
    stops: b.stops.map(x => ({ ...x, name: t(x.name) })),
    buildup: b.buildup.map(d => ({ ...d, forms: stretch(d.forms), start: stretch(d.start), biggest: stretch(d.biggest), stretches: d.stretches.map(x => stretch(x)!) })),
  });
  return {
    ...v3,
    stops: v3.stops.map(x => ({ ...x, name: t(x.name) })),
    buildup: bandData({ stops: [], adherence: v3.adherence, buildup: v3.buildup }).buildup,
    bands: Object.fromEntries(Object.entries(v3.bands).map(([k, b]) => [k, bandData(b)])) as LiveV3['bands'],
    bunching: v3.bunching.map(d => ({ ...d, bands: Object.fromEntries(Object.entries(d.bands).map(([k, band]) => [k, { ...band, forms: stretch(band.forms), biggestRise: stretch(band.biggestRise), stops: band.stops.map(x => ({ ...x, name: t(x.name) })) }])) })),
  };
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;
/** Axis value with its unit, with a real minus sign. */
const axisMin = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;

export type Ready = Extract<LiveDashboardResponse, { status: 'ready' }>;


function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
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

function Filters({ v3, dir, setDir }: { v3: LiveV3; dir: number | null; setDir: (d: number | null) => void }) {
  const dirs = Object.keys(v3.directionLabels).map(Number).sort();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label="Filters">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Direction">
        <Pill size="segment" selected={dir == null} onClick={() => setDir(null)}>Both directions</Pill>
        {dirs.map(d => <Pill key={d} size="segment" selected={dir === d} onClick={() => setDir(d)}>{v3.directionLabels[String(d)]}</Pill>)}
      </div>
    </div>
  );
}

/** A section's answer for each time of day, as a compact list (no toggle): "AM peak: builds up by King St West". */
function PerPeriod({ title, rows }: { title: string; rows: Array<{ key: string; label: string; text: string }> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-black">{title}</h4>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
        {rows.map(r => <div key={r.key} className="contents"><dt className="text-[var(--text-muted)]">{r.label}</dt><dd className="m-0">{r.text}</dd></div>)}
      </dl>
    </div>
  );
}
const PERIOD_BANDS_ONLY = BANDS.filter(([k]) => k !== 'all');

/** B1: how well the route keeps to its timetable, at timepoints (where the timetable really schedules a time). */
function Adherence({ data, dir, lateMin }: { data: DashboardBandData; dir: number | null; lateMin: number }) {
  const countsFor = (d: Day) => { const b = data.adherence.timepoints[d]; return dir == null ? b.overall : b.byDirection[String(dir)]; };
  const all = countsFor('all');
  const parts = [{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }];
  return (
    <Section id="b1" title="How well it keeps to its timetable">
      {all && all.n > 0 ? (
        <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Share of departures {lateMin}+ minutes late, at the stops where the timetable gives a time.</p>
          <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
            {DAYS.map(([k, label]) => {
              const c = countsFor(k);
              return c && c.n > 0
                ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} />
                : <Tile key={k} label={label} value="–" sub="too few departures" />;
            })}
          </div>
          <h3 className="mt-6 text-base font-black">By hour of the day</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">How many departures are ahead, on time or late in each hour. Hover over an hour to see its time of day.</p>
          <div className="mt-3 grid gap-6 md:grid-cols-3">
            {DAYS.map(([k, label]) => {
              const c = countsFor(k);
              return (
                <HourBars
                  key={k}
                  title={label}
                  showKey={k === 'weekend'}
                  ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${c ? pct(c.lateShare) : '–'} late overall.`}
                  parts={parts}
                  columns={data.adherence.timepoints[k].byHour.map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
                />
              );
            })}
          </div>
        </>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>}
    </Section>
  );
}

/** B3: where delays build up. One chart per direction, on a shared scale. */
function Buildup({ v3, data, dir, uncertain }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[] }) {
  const rows = data.buildup.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  // Stops at the start of a direction that are measured poorly (510 northbound under Union Station) are drawn as less exact.
  const lessExactStops = (d: number) => uncertain.find(u => u.directionId === d)?.stops ?? 0;
  const pointsOf = (b: (typeof rows)[number]): ProfilePoint[] => b.stretches.filter(s => s.n >= 10).map((s, i) => ({
    label: s.toName, short: shortStopName(s.toName), major: isMajorStop(s.toName), lessExact: i < lessExactStops(b.directionId) - 1,
    y: s.medianDelayMin, lo: s.p10DelayMin, hi: s.p90DelayMin, n: s.n,
  }));
  const scale = sharedScale(rows.map(pointsOf));
  return (
    <Section id="b3" title="Where delays build up">
      <p className="mt-2 text-sm text-[var(--text-muted)]">How late vehicles leave each stop along the route, and where that delay jumps and stays up.</p>
      <div className={`mt-4 grid gap-6 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const points = pointsOf(b);
          const marked = b.forms ? points.findIndex(p => p.label === b.forms!.toName) : -1;
          const worst = [...b.stretches].filter(s => s.n >= 30).sort((a, c) => c.medianAddedMin - a.medianAddedMin).slice(0, 5);
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <ProfileBars
                ariaLabel={`${label}: typical delay at each stop along the route. ${buildupSentence(label, b)}`}
                takeaway={buildupTakeaway(b, lessExactStops(b.directionId))}
                axisTitle="Minutes late"
                points={points}
                formatY={axisMin}
                unit="trips"
                valueHeader="Typical delay"
                caption="How late vehicles usually leave each stop: above the line is late, below is early."
                whiskers={false}
                zero
                zeroLabel="On time"
                scale={scale}
                lessExactNote="the first stops are in the tunnel, where we see the vehicles less often, so these are rough."
                marks={marked >= 0 ? [{ index: marked, label: `Builds up by ${points[marked].short}` }] : []}
              />
              <PerPeriod
                title="By time of day"
                rows={PERIOD_BANDS_ONLY.flatMap(([k, name]) => {
                  const pb = v3.bands[k]?.buildup.find(x => x.directionId === b.directionId);
                  if (!pb) return [];
                  const text = pb.kind === 'forms' && pb.forms ? `builds up by ${shortStopName(pb.forms.toName)} (${mins(pb.forms.medianAddedMin)})` : pb.kind === 'gradual' ? 'builds slowly, no single stretch' : pb.kind === 'none' ? 'stays about level' : 'too few trips';
                  return [{ key: k, label: name, text }];
                })}
              />
              <div className="mt-3 overflow-x-auto">
                <SortableDataTable
                  caption={`${label}: the stretches that add the most delay`}
                  defaultSort="added"
                  rows={worst}
                  rowKey={s => `${s.fromStopId}-${s.toStopId}`}
                  columns={[
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, width: 14, className: 'font-normal truncate', cell: s => <span title={`${s.fromName} to ${s.toName}`}>{shortStopName(s.fromName)} to {shortStopName(s.toName)}</span> },
                    { key: 'added', header: 'Typical added', width: 7, worst: s => s.medianAddedMin, cell: s => mins(s.medianAddedMin) },
                    { key: 'grows', header: 'Trips where it grows', width: 10, worst: s => s.growShare, cell: s => `${pct(s.growShare)} of ${s.n.toLocaleString()}` },
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

/** B2: stops with the most delay, ranked by how often vehicles leave 5.5+ min late. One table with a small bar in each row. */
function WorstStops({ v3, data, dir, uncertain }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[] }) {
  const ranked = useMemo(() => rankStops(data.stops, dir, uncertain), [data, dir, uncertain]);
  const top = ranked.slice(0, 10);
  const both = dir == null;
  const hidden = uncertain.filter(u => dir == null || u.directionId === dir);
  return (
    <Section id="b2" title="Stops with the most delay">
      <p className="mt-2 text-sm text-[var(--text-muted)]">Stops ranked by how often vehicles leave {v3.thresholds.lateAtOrAboveMin}+ minutes late (stops with 30+ departures).</p>
      {top.length ? (
        <div className="mt-4 overflow-x-auto">
          <SortableDataTable
            caption="Stops ranked by the share of late departures"
            defaultSort="late"
            rows={top}
            rowKey={s => `${s.stopId}-${s.directionId}`}
            columns={[
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: s => <span title={s.name}>{s.name}</span> },
              ...(both ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof top)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
              { key: 'late', header: 'Late', worst: s => s.lateShare, cell: s => (
                <span className="inline-flex items-center gap-2">
                  <span className="block h-2 w-20 rounded-sm bg-[var(--control-inactive-bg)]" aria-hidden="true"><span className="block h-full rounded-sm bg-[var(--accent)] opacity-90" style={{ width: `${Math.max(2, s.lateShare * 100)}%` }} /></span>
                  {pct(s.lateShare)}
                </span>
              ) },
              { key: 'median', header: 'Typical delay', worst: s => s.medianMin, cell: s => mins(s.medianMin) },
              { key: 'p90', header: '1 in 10 later than', width: 10, worst: s => s.p90Min, cell: s => mins(s.p90Min) },
              { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
            ]}
          />
        </div>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>}
      {hidden.length > 0 && (
        <p className="mt-2 max-w-2xl text-xs text-[var(--text-dim)]">
          Not ranked: the first {hidden[0].stops} stops {hidden.length === 1 ? v3.directionLabels[String(hidden[0].directionId)].toLowerCase() : 'in some directions'}, where delay is less exact (see the note above).
        </p>
      )}
    </Section>
  );
}

/** B4: where and why bunching forms. "Linked to", never "caused by". Too-close and too-far gaps are shown separately. */
function Bunching({ v3, dir, band }: { v3: LiveV3; dir: number | null; band: DashboardBand }) {
  const rows = v3.bunching.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  const pointsOf = (data: DashboardBunchingBand): ProfilePoint[] => data.stops.filter(s => s.n >= 10).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: s.bunchedShare, y2: s.gappedShare, n: s.n }));
  const scale = sharedScale(rows.flatMap(b => (b.bands[band] ? [pointsOf(b.bands[band])] : [])));
  return (
    <Section id="b4" title="Where bunching forms">
      <p className="mt-2 text-sm text-[var(--text-muted)]">How often vehicles come too close together or too far apart, stop by stop, and where that starts.</p>
      <div className={`mt-4 grid gap-6 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const data: DashboardBunchingBand | undefined = b.bands[band];
          if (!data) return null;
          const points = pointsOf(data);
          const stretch = data.forms ?? data.biggestRise;
          const markIdx = stretch ? points.findIndex(p => p.label === data.stops.find(s => s.stopId === stretch.toStopId)?.name) : -1;
          const linked = stretch?.links.filter(l => l.linked) ?? [];
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <p className="mt-1 text-sm leading-6">{bunchingSentence(label, data)}</p>
              {points.length > 1 && (
                <ProfileBars
                  ariaLabel={`${label}: share of gaps that are too close together or too far apart, stop by stop. ${bunchingSentence(label, data)}`}
                  points={points}
                  formatY={y => pct(y)}
                  unit="gaps"
                  valueHeader="Gaps off the timetable"
                  caption="How often vehicles arrive too close together or too far apart, at each stop."
                  axisTitle="Share of gaps"
                  scale={scale}
                  series={[{ name: 'Too close together', color: 'var(--status-negative-text)' }, { name: 'Too far apart', color: 'var(--status-caution-text)' }]}
                  marks={markIdx >= 0 ? [{ index: markIdx, label: data.kind === 'forms' ? 'Forms here' : 'Biggest rise' }] : []}
                />
              )}
              {stretch && (
                <>
                  <p className="mt-3 text-sm">{data.kind === 'forms' ? 'It forms' : 'Its biggest rise is'} between {stretch.fromName} and {stretch.toName}.</p>
                  <h4 className="mt-1 text-sm font-black">{linked.length ? 'Linked to' : 'Nothing measured here is linked to it'}</h4>
                  <ul className="mt-1 space-y-1 text-sm">
                    {stretch.links.map(l => (
                      <li key={l.kind} className={l.linked ? '' : 'text-[var(--text-dim)]'}>
                        {l.value == null ? 'Not measured' : l.linked ? 'Linked' : 'Not linked'}: {LINK_LABELS[l.kind]} ({linkValueText(l.kind, l.value)})
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-[var(--text-dim)]">Linked means it was measured in this stretch, not that it is the cause.</p>
                </>
              )}
              <PerPeriod
                title="By time of day"
                rows={PERIOD_BANDS_ONLY.flatMap(([k, name]) => {
                  const pb = b.bands[k];
                  if (!pb || pb.kind == null) return [];
                  const text = pb.kind === 'forms' && pb.forms ? `forms by ${shortStopName(pb.forms.toName)}` : pb.kind === 'gradual' ? 'builds slowly, no single stretch' : 'stays close to the timetable';
                  return [{ key: k, label: name, text }];
                })}
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? 'a' : 'p'}`;

/** This week against last week: five tiles, each a number, a label and a change chip coloured only beyond normal noise. */
function WeekCompare({ v3 }: { v3: LiveV3 }) {
  // The dashboard's own tiles (labels, change chips, noise rule), so the two views always match.
  return (
    <Section id="week" title="This week compared with last week">
      <KpiRow v3={v3} />
    </Section>
  );
}

/** How long the whole trip takes against the timetable, by direction and hour. */
function RunningTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  if (!rt) return null;
  const dirs = Object.keys(v3.directionLabels).map(Number).sort().filter(d => dir == null || d === dir);
  const hoursOf = (d: number) => (rt.byHour[String(d)] ?? []).filter(h => h.n >= 1 && (band === 'all' || periodKeyForHour(h.hour) === band));
  const scale = runTimeScale(dirs.map(hoursOf));
  return (
    <Section id="runtime" title="Run time">
      <p className="mt-2 text-sm text-[var(--text-muted)]">How long the trip takes against the schedule, by the hour it starts, over the stops every regular trip serves, so short turns count too.</p>
      <div className={`mt-4 grid gap-6 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {dirs.map(d => {
          const label = v3.directionLabels[String(d)];
          const figures = rt.bands[band]?.[String(d)];
          const hours = hoursOf(d);
          return (
            <div key={d} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              {runTimeStretchLabel(rt.stretch?.[String(d)], n => shortStopName(titleCase(n))) && <p className="text-sm text-[var(--text-muted)]">{runTimeStretchLabel(rt.stretch?.[String(d)], n => shortStopName(titleCase(n)))}</p>}
              <p className="mt-1 text-sm leading-6">{withoutDevHint(runningTimeSentence(label, figures))}</p>
              {hours.length > 1 && (
                <>
                  <p className="mt-1 text-sm font-bold">{runTimeTakeaway(label, hours)}</p>
                  <div className="mt-2"><RunTimeChart hours={hours} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts. ${withoutDevHint(runningTimeSentence(label, figures))}`} /></div>
                </>
              )}
              {(rt.branches?.[String(d)] ?? []).length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-black">Longer patterns, each end to end</h4>
                  <ul className="mt-1 space-y-1 text-sm text-[var(--text-secondary)]">
                    {rt.branches![String(d)].flatMap(b => { const f = branchFigures(b, band); return f ? [<li key={`${b.fromStopId}-${b.toStopId}`} className={f.n < 30 ? 'text-[var(--text-dim)]' : ''}>{branchRunTimeLine(b, n => shortStopName(titleCase(n)), f)}{f.n < 30 ? ' Few trips: treat with care.' : ''}</li>] : []; })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** Extra wait: how much longer riders wait than the timetable promises, at stops with service every 15 minutes or better. */
function ExtraWait({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const all = v3.extraWait?.[band];
  if (!all) return null;
  const dirs = Object.keys(v3.directionLabels).map(Number).sort().filter(d => dir == null || d === dir);
  const pointsOf = (d: number): ProfilePoint[] => all.filter(s => s.directionId === d).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: Math.max(0, s.extraWaitMin), n: s.gaps }));
  const scale = sharedScale(dirs.map(pointsOf));
  const worst = all.filter(s => (dir == null || s.directionId === dir) && s.gaps >= 30).sort((a, b) => b.extraWaitMin - a.extraWaitMin).slice(0, 10);
  return (
    <Section id="wait" title="Extra wait">
      <p className="mt-2 text-sm text-[var(--text-muted)]">How much longer riders wait than the timetable promises, where a vehicle is due every 15 minutes or better.</p>
      {all.length === 0 ? <p className="mt-3 text-sm text-[var(--text-muted)]">No stop on this route has a vehicle every 15 minutes or better in this time of day.</p> : (
        <>
          <div className={`mt-4 grid gap-6 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {dirs.map(d => {
              const label = v3.directionLabels[String(d)];
              const points = pointsOf(d);
              const sentence = extraWaitSentence(all.filter(s => s.directionId === d), label);
              return (
                <div key={d} className="min-w-0">
                  <h3 className="text-base font-black">{label}</h3>
                  {sentence && <p className="mt-1 text-sm leading-6">{sentence}</p>}
                  {points.length > 1 && (
                    <ProfileBars
                      ariaLabel={`${label}: extra wait at each stop along the route. ${sentence ?? ''}`}
                      points={points}
                      formatY={y => `${num(y)} min`}
                      unit="gaps"
                      valueHeader="Extra wait"
                      caption="How much longer riders wait than the timetable says, at each stop."
                      axisTitle="Extra minutes"
                      scale={scale}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {worst.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <SortableDataTable
                caption="Stops where riders wait longest compared with the timetable"
                defaultSort="extra"
                rows={worst}
                rowKey={s => `${s.stopId}-${s.directionId}`}
                columns={[
                  { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal truncate', cell: s => <span title={s.name}>{s.name}</span> },
                  ...(dir == null ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof worst)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
                  { key: 'extra', header: 'Extra wait', worst: s => s.extraWaitMin, cell: s => `${num(s.extraWaitMin)} min` },
                  { key: 'sched', header: 'Scheduled every', cell: s => `${num(s.scheduledGapMin)} min` },
                  { key: 'n', header: 'Gaps', cell: s => s.gaps.toLocaleString() },
                ]}
              />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** Service delivered: the share of scheduled trips that ran, by day, only on days with healthy recordings. */
function Delivered({ v3, dir }: { v3: LiveV3; dir: number | null }) {
  const sd = v3.serviceDelivered;
  if (!sd) return null;
  const overall = dir == null ? sd.overall : sd.overall.byDirection[String(dir)];
  const days = sd.byDay.filter(d => d.healthy);
  const skipped = sd.byDay.filter(d => !d.healthy);
  const points: ProfilePoint[] = days.map(d => ({ label: dateRangeText(d.date, d.date), y: dir == null ? d.share ?? 0 : d.byDirection[String(dir)] ?? 0, n: d.seen + d.notSeen }));
  return (
    <Section id="delivered" title="Service delivered">
      {overall && <p className="mt-2 text-sm">{deliveredSentence(overall, dir == null ? undefined : v3.directionLabels[String(dir)])}</p>}
      {points.length > 1 && (
        <div className="mt-4 max-w-2xl">
          <ProfileBars
            ariaLabel="Share of scheduled trips that ran, day by day"
            points={points}
            formatY={y => `${Math.round(y * 1000) / 10}%`}
            unit="trips"
            valueHeader="Ran"
            rowHeader="Day"
            caption="How many of the scheduled trips ran, each day."
            scale={{ min: 0.9, max: 1 }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--text-dim)]">Trips during gaps in our recordings aren't counted.{skipped.length > 0 && <> Not counted: {skipped.map(d => dateRangeText(d.date, d.date)).join(', ')} (gaps in our recordings).</>}</p>
    </Section>
  );
}

export function Method({ data }: { data: Ready }) {
  const { v3 } = data;
  const [first, last] = [v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1]];
  return (
    <details className="mt-12 group" id="method">
      <summary className="cursor-pointer text-xl font-black tracking-tight">How this is measured</summary>
      <ul className="mt-3 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]">
        <li>Counted at timepoints: the stops where the timetable gives a time. Times between them are estimated, so the share late counting every stop is shown only here: {pct(v3.bands.all.adherence.allStops.all.overall.lateShare)} of {v3.bands.all.adherence.allStops.all.overall.n.toLocaleString()} departures.</li>
        <li>Delay builds up where the biggest jump in delay holds for the next few stops (3 stops or about 1 km).</li>
        <li>Bunching: gaps under {Math.round(v3.thresholds.bunchedGapSec / 60)} minutes count as too close together; gaps more than twice the timetable's count as too far apart. "Linked to" means measured in the same stretch, not the cause.</li>
        <li>Trip time counts only trips on the main route seen at both ends (short turns are left out). Extra wait is worked out from the gaps between vehicles at each stop.</li>
        <li>Service delivered: a trip counts as run when a vehicle was seen under its trip number. Days with gaps in our recordings are left out{v3.serviceDelivered && v3.serviceDelivered.overall.unknown > 0 ? `, and ${v3.serviceDelivered.overall.unknown.toLocaleString()} trips that could not be judged are left out` : ''}.</li>
        {v3.weekly && <li>This week compared with last week: {weekCaption(v3.weekly)} {NOISE_RULE}</li>}
        <li>Window: the last {v3.window.days} service days ({first} to {last}); {v3.totals.runs.toLocaleString()} trips and {v3.totals.stopPassages.toLocaleString()} stop departures. Built {data.generatedAt.slice(0, 10)}.</li>
        <li>Delay at a stop is how late the vehicle left it compared with the timetable. The agency does not report delays, so we work them out from where each vehicle was seen (about once a minute) and estimate the moment it left the stop.</li>
        <li>Vehicles are matched to timetable trips by trip number. If a trip is 15+ minutes off its own slot but another trip fits within 3 minutes at most stops, it is counted as that trip; otherwise it is left out.</li>
        <li>Because vehicles are seen only about once a minute, {pct(v3.uncertainty.nearCutoffShare)} of departures at stops with a scheduled time are within {Math.round(v3.uncertainty.withinMin * 60)} seconds of a limit, and could land on either side of it.</li>
        <li>Late means {v3.thresholds.lateAtOrAboveMin}+ minutes after the timetable; ahead means {Math.abs(v3.thresholds.earlyAtOrBelowMin)}+ minutes before it. These are the same limits the Live map uses.</li>
        {v3.leftOut && (v3.leftOut.noTimetableTrip > 0 || v3.leftOut.excluded > 0) && (
          <li>
            {v3.leftOut.noTimetableTrip > 0 && <>{v3.leftOut.noTimetableTrip.toLocaleString()} runs ({pct(v3.leftOut.noTimetableTrip / (v3.leftOut.kept + v3.leftOut.noTimetableTrip + v3.leftOut.excluded))} of the vehicle trips seen) were under a trip number that is not on the timetable, such as extra or unscheduled buses, so they cannot be compared with it and are left out. </>}
            {v3.leftOut.excluded > 0 && <>{v3.leftOut.excluded.toLocaleString()} runs by {v3.leftOut.excludedLabel ?? 'another service'} that share this route number are also left out; they are a separate service. </>}
            The figures describe the {v3.leftOut.kept.toLocaleString()} timetabled trips that were kept.
          </li>
        )}
        <li>{pct(v3.swaps.rate)} of trips ran under a trip number that did not fit their own timetable slot: {v3.swaps.reassigned} were matched to the slot that fit, {v3.swaps.dropped} were left out.</li>
        {data.replacementBuses && <li>This route is run by replacement buses in this timetable, so every figure describes the buses.</li>}
      </ul>
    </details>
  );
}

export const BOUNDARY = (what: string) => withoutDevHint(`${what} could not be drawn: the analysis file may be from an older version. Rebuild it with npm run live:analyze.`);

function AnalysisPage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  // No time-of-day toggle: every section shows the whole day; hour charts highlight a period on hover, and sections
  // whose answer differs by period list it per period.
  const band: DashboardBand = 'all';
  const [dir, setDir] = useState<number | null>(() => { const d = new URLSearchParams(window.location.search).get('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  // The filters live in the address, so a link reopens the same view.
  useEffect(() => { syncUrlParams({ band: null, day: null, dir: dir == null ? null : String(dir) }); }, [dir]);
  // The dashboard is the default; ?view=analysis is the full page.
  const [view, setView] = useState<'dashboard' | 'analysis'>(() => (new URLSearchParams(window.location.search).get('view') === 'analysis' ? 'analysis' : 'dashboard'));
  useEffect(() => { syncUrlParams({ view: view === 'analysis' ? 'analysis' : null }); }, [view]);
  useEffect(() => {
    if (view !== 'analysis' || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [view, state.kind]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agency.toUpperCase()} ${route}`), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const title = `${agency.toUpperCase()} ${route}`;
  const back = FEATURES.live ? <ArrowLink href="/apps/live" className="mt-6">Open Live</ArrowLink> : null;
  if (state.kind === 'loading') return <PageShell variant="wide"><p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {title}…</p></PageShell>;
  if (state.kind === 'error') return <PageShell variant="wide"><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{state.reason}</p>{back}</PageShell>;
  const data = state.data;
  if (data.status !== 'ready') {
    return (
      <PageShell variant="wide">
        <PageTitle className="mt-24">{title}</PageTitle>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>
        {back}
      </PageShell>
    );
  }
  // A malformed file must not blank the page: fall back to the raw names and let each section's boundary report its own problem.
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const bandData = v3.bands?.[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <PageTitle>{title}: how it is running</PageTitle>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {v3.window.dates.length ? `${dateRangeText(v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1])} · ` : ''}{v3.totals.runs.toLocaleString()} trips · estimated from where vehicles were, not reported by {agency.toUpperCase()}
            </p>
          </div>
          {FEATURES.live && <ArrowLink href="/apps/live">View on Live map</ArrowLink>}
        </div>
        {(() => {
          const f = freshness(v3, route, Date.now());
          return f.stale ? <p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{withoutDevHint(f.text)}</p> : null;
        })()}
        {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="View">
          <Pill size="segment" selected={view === 'dashboard'} onClick={() => setView('dashboard')}>Dashboard</Pill>
          <Pill size="segment" selected={view === 'analysis'} onClick={() => setView('analysis')}>Full analysis</Pill>
        </div>
        {view === 'dashboard' ? (
          <LiveDashboardView v3={v3} data={v3.bands.all} band="all" dir={dir} uncertain={uncertain} note={data.note} title={title}
            filters={<Filters v3={v3} dir={dir} setDir={setDir} />}
            toFull={hash => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`); setView('analysis'); }} />
        ) : (<>
        <Filters v3={v3} dir={dir} setDir={setDir} />
        <ErrorBoundary label={BOUNDARY('This week compared with last week')}><WeekCompare v3={v3} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('How well it keeps to its timetable')}><Adherence data={bandData} dir={dir} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Run time')}><RunningTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Where delays build up')}><Buildup v3={v3} data={bandData} dir={dir} uncertain={uncertain} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Stops with the most delay')}><WorstStops v3={v3} data={bandData} dir={dir} uncertain={uncertain} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Extra wait')}><ExtraWait v3={v3} band={band} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Where bunching forms')}><Bunching v3={v3} dir={dir} band={band} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('Service delivered')}><Delivered v3={v3} dir={dir} /></ErrorBoundary>
        <ErrorBoundary label="How this is measured could not be drawn."><Method data={data} /></ErrorBoundary>
        </>)}
      </article>
    </PageShell>
  );
}

/** ?view=explore opens the new full-analysis view (beta); everything else is the page above. */
export default function LiveRoutePage() {
  const [explore] = useState(() => new URLSearchParams(window.location.search).get('view') === 'explore');
  return explore ? <LiveExplorePage /> : <AnalysisPage />;
}
