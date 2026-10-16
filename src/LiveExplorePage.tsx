import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { ATLAS_MODE, FEATURES, periodKeyForHour } from '../shared/config';
import {
  LINK_LABELS, dateRangeText, freshness, linkValueText, rankStops,
  type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { delayAmount, headwayAmount } from '../shared/headwayText';
import { SITE_URL } from '../shared/seo';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { devOnly, liveReportTitle, withoutDevHint } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { isMajorStop, shortStopName } from './utils/stopLabel';
import { TILE } from './pageStyles';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import SortableDataTable from './components/ui/SortableDataTable';
import Pill from './components/ui/Pill';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import LiveOffNotice from './components/LiveOffNotice';
import ProfileBars, { sharedScale, type ProfilePoint } from './components/charts/ProfileBars';
import HourBars from './components/charts/HourBars';
import RunTimeChart, { runTimeScale } from './components/charts/RunTimeChart';
import type { RouteStripMode } from './components/Live/RouteStrip';
import DirectionStrip, { directionStopsById } from './components/Live/DirectionStrip';
import { delayText, type RouteStripStop } from './components/Live/routeStripModel';
import { KpiRow } from './LiveDashboardView';
import { BOUNDARY, Method, withNiceNames } from './LiveRoutePage';
import { weekOfText, lateCount, lateHourLine } from '../shared/liveWording';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
export const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];
const MINUS = '−';
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', MINUS);
const mins = (x: number) => `${x > 0 ? '+' : ''}${num(x)} min`;

/** What is open in the detail panel: a stop (by its place in the direction's strip) or a marked stretch. */
type Selection = { dir: number; kind: 'stop'; stopId: string } | { dir: number; kind: 'stretch'; mode: RouteStripMode };

const dirsOf = (v3: LiveV3, dir: number | null) => Object.keys(v3.directionLabels).map(Number).sort((a, b) => a - b).filter(d => dir == null || d === dir);
const readParam = (key: string) => new URLSearchParams(window.location.search).get(key);

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="mt-12 min-w-0" aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}

export function Group({ label, options, value, onChange }: { label: string; options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, text]) => <Pill key={k} size="segment" selected={value === k} onClick={() => onChange(k)}>{text}</Pill>)}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-primary)] py-2 last:border-b-0">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-right">
        <span className="text-base font-black tracking-tight">{value}</span>
        {sub && <span className="block text-xs text-[var(--text-dim)]">{sub}</span>}
      </dd>
    </div>
  );
}

function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      {title && <h4 className="text-sm font-black">{title}</h4>}
      <dl className="m-0">{children}</dl>
    </div>
  );
}

/** Everything known about the picked stop or stretch, for the time of day chosen above. */
function DetailPanel({ v3, band, sel, stops, data }: { v3: LiveV3; band: DashboardBand; sel: Selection; stops: Map<string, RouteStripStop>; data: DashboardBandData }) {
  const strip = { label: v3.directionLabels[String(sel.dir)] };
  const buildup = data.buildup.find(b => b.directionId === sel.dir);
  const bunchBand = v3.bunching.find(b => b.directionId === sel.dir)?.bands[band];
  const nice = (n: string) => shortStopName(n);

  if (sel.kind === 'stretch') {
    if (sel.mode === 'delay') {
      const f = buildup?.forms;
      if (!f) return null;
      return (
        <Panel title={`${nice(f.fromName)} to ${nice(f.toName)}`} sub={strip.label}>
          <Block>
            <Fact label="Typical added" value={mins(f.medianAddedMin)} />
            <Fact label="Trips where it grows" value={pct(f.growShare)} sub={`of ${f.n.toLocaleString()}`} />
            <Fact label="Typical delay" value={mins(f.medianDelayMin)} />
            <Fact label="1 in 10 later than" value={mins(f.p90DelayMin)} />
          </Block>
        </Panel>
      );
    }
    const b = bunchBand?.forms;
    if (!b) return null;
    const linked = b.links.filter(l => l.linked);
    return (
      <Panel title={`${nice(b.fromName)} to ${nice(b.toName)}`} sub={strip.label}>
        <Block>
          <Fact label="Gaps off the timetable" value={`${pct(b.fromBadShare)} to ${pct(b.toBadShare)}`} />
        </Block>
        <Block title={linked.length ? 'Linked to' : 'Nothing measured here is linked to it'}>
          {b.links.map(l => (
            <Fact key={l.kind} label={`${l.value == null ? 'Not measured' : l.linked ? 'Linked' : 'Not linked'}: ${LINK_LABELS[l.kind]}`} value={l.value == null ? '' : linkValueText(l.kind, l.value)} />
          ))}
        </Block>
      </Panel>
    );
  }

  const s = stops.get(sel.stopId);
  if (!s) return null;
  const full = data.stops.find(x => x.stopId === s.stopId && x.directionId === sel.dir);
  const bunch = bunchBand?.stops.find(x => x.stopId === s.stopId);
  const extra = v3.extraWait?.[band]?.find(x => x.directionId === sel.dir && x.stopId === s.stopId);
  const into = buildup?.stretches.find(x => x.toStopId === s.stopId);
  return (
    <Panel title={s.name} sub={strip.label}>
      <Block>
        {s.n > 0 && s.delayMin != null ? (
          <>
            <Fact label="Typical delay" value={delayText(s.delayMin)} />
            {full && <Fact label="1 in 10 later than" value={mins(full.p90Min)} />}
            {s.lateShare != null && <Fact label="Late" value={pct(s.lateShare)} sub={`of ${s.n.toLocaleString()} departures`} />}
          </>
        ) : <Fact label="Typical delay" value="not measured" />}
        {s.uncertain && <p className="mt-2 text-xs text-[var(--text-dim)]">Less exact here: vehicles report their location less often</p>}
      </Block>
      {bunch && bunch.n > 0 && (
        <Block>
          <Fact label="Too close together" value={pct(bunch.bunchedShare)} />
          <Fact label="Too far apart" value={pct(bunch.gappedShare)} sub={`${bunch.n.toLocaleString()} gaps`} />
        </Block>
      )}
      {extra && (
        <Block>
          <Fact label="Extra wait" value={delayAmount(Math.max(0, extra.extraWaitMin))} sub={`Scheduled every ${headwayAmount(extra.scheduledGapMin)}`} />
        </Block>
      )}
      {into && into.n > 0 && (
        <Block title={`${nice(into.fromName)} to ${nice(into.toName)}`}>
          <Fact label="Typical added" value={mins(into.medianAddedMin)} />
          <Fact label="Trips where it grows" value={pct(into.growShare)} sub={`of ${into.n.toLocaleString()}`} />
        </Block>
      )}
    </Panel>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <aside className={`${TILE} min-w-0 lg:sticky lg:top-4`} aria-live="polite">
      <h3 className="text-lg font-black leading-tight">{title}</h3>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{sub}</div>
      <div className="mt-3">{children}</div>
    </aside>
  );
}

function Main({ v3, band, dir, uncertain, sel, setSel }: {
  v3: LiveV3; band: DashboardBand; dir: number | null; uncertain: UncertainStart[]; sel: Selection; setSel: (s: Selection) => void;
}) {
  const data = v3.bands[band];
  const dirs = dirsOf(v3, dir);
  const stops = useMemo(() => directionStopsById(v3, sel.dir, band, uncertain), [v3, sel.dir, band, uncertain]);
  return (
    <div id="x-strip" className="mt-6 scroll-mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        {dirs.map(d => (
          <div key={d} className="min-w-0">
            <h3 className="mb-1 text-base font-black">{v3.directionLabels[String(d)]}</h3>
            <DirectionStrip
              v3={v3} directionId={d} band={band} uncertain={uncertain}
              selectedId={sel.dir === d && sel.kind === 'stop' ? sel.stopId : null}
              onSelect={stopId => setSel({ dir: d, kind: 'stop', stopId })}
              selectedStretch={sel.dir === d && sel.kind === 'stretch' ? sel.mode : null}
              onSelectStretch={mode => setSel({ dir: d, kind: 'stretch', mode })}
            />
          </div>
        ))}
      </div>
      <DetailPanel v3={v3} band={band} sel={sel} stops={stops} data={data} />
    </div>
  );
}

/** Share of departures ahead, on time and late by hour for the chosen kind of day. */
function Late({ data, dir, day, band, lateMin }: { data: DashboardBandData; dir: number | null; day: Day; band: DashboardBand; lateMin: number }) {
  const block = data.adherence.timepoints[day];
  const c = dir == null ? block.overall : block.byDirection[String(dir)];
  const label = DAYS.find(([k]) => k === day)![1];
  const parts = [{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }];
  if (!c || c.n === 0) return <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time.</p>;
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className={TILE}>
        <div className="text-xs font-bold text-[var(--text-muted)]">{label}</div>
        <div className="mt-1 text-3xl font-black tracking-tight">{pct(c.lateShare)}</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">late, of {c.n.toLocaleString()} · {pct(c.earlyShare)} ahead</div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">{lateMin}+ min</div>
      </div>
      <HourBars
                  hoverLine={(t, c) => lateHourLine(t, lateCount(c.parts[2], c.n), c.n)}
                  departures
        ariaLabel={`${label}: share of departures ahead of the timetable, on time and late, by hour of the day. ${pct(c.lateShare)} late overall.`}
        parts={parts}
        columns={block.byHour.filter(h => band === 'all' || periodKeyForHour(h.hour) === band).map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
      />
    </div>
  );
}

function RunTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  if (!rt) return null;
  const dirs = dirsOf(v3, dir);
  const hoursOf = (d: number) => (rt.byHour[String(d)] ?? []).filter(h => h.n >= 1 && (band === 'all' || periodKeyForHour(h.hour) === band));
  const scale = runTimeScale(dirs.map(hoursOf));
  return (
    <div className={`mt-4 grid gap-x-10 gap-y-8 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {dirs.map(d => {
        const label = v3.directionLabels[String(d)];
        const hours = hoursOf(d);
        const f = rt.bands[band]?.[String(d)];
        return (
          <div key={d} className="min-w-0">
            <h3 className="text-base font-black">{label}</h3>
            {f && <div className="text-sm text-[var(--text-muted)]">Usually {Math.round(f.typicalMin)} min · timetable {Math.round(f.scheduledMin)} · 1 in 10 over {Math.round(f.p90Min)}</div>}
            {hours.length > 1 && <div className="mt-2"><RunTimeChart hours={hours} scale={scale} ariaLabel={`${label}: run time against the schedule by the hour the trip starts.`} /></div>}
          </div>
        );
      })}
    </div>
  );
}

function Buildup({ v3, data, dir, uncertain }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[] }) {
  const rows = data.buildup.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  const lessExactStops = (d: number) => uncertain.find(u => u.directionId === d)?.stops ?? 0;
  const pointsOf = (b: (typeof rows)[number]): ProfilePoint[] => b.stretches.filter(s => s.n >= 10).map((s, i) => ({
    label: s.toName, short: shortStopName(s.toName), major: isMajorStop(s.toName), lessExact: i < lessExactStops(b.directionId) - 1,
    y: s.medianDelayMin, lo: s.p10DelayMin, hi: s.p90DelayMin, n: s.n,
  }));
  const scale = sharedScale(rows.map(pointsOf));
  return (
    <>
      <div className={`mt-4 grid gap-x-10 gap-y-8 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const points = pointsOf(b);
          const marked = b.forms ? points.findIndex(p => p.label === b.forms!.toName) : -1;
          const worst = [...b.stretches].filter(s => s.n >= 30).sort((a, c) => c.medianAddedMin - a.medianAddedMin).slice(0, 5);
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <ProfileBars
                ariaLabel={`${label}: typical delay at each stop along the route.`}
                axisTitle="Minutes late"
                points={points}
                formatY={y => `${y > 0 ? '+' : ''}${num(y)} min`}
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
              <div className="mt-3 overflow-x-auto">
                <SortableDataTable
                  caption={`${label}: the stretches that add the most delay`}
                  defaultSort="added"
                  rows={worst}
                  rowKey={s => `${s.fromStopId}-${s.toStopId}`}
                  columns={[
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, className: 'font-normal', cell: s => `${s.fromName} to ${s.toName}` },
                    { key: 'added', header: 'Typical added', worst: s => s.medianAddedMin, cell: s => mins(s.medianAddedMin) },
                    { key: 'grows', header: 'Trips where it grows', worst: s => s.growShare, cell: s => `${pct(s.growShare)} of ${s.n.toLocaleString()}` },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function WorstStops({ v3, data, dir, uncertain, onPick, canPick }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[]; onPick: (directionId: number, stopId: string) => void; canPick: (directionId: number, stopId: string) => boolean }) {
  const top = useMemo(() => rankStops(data.stops, dir, uncertain).slice(0, 10), [data, dir, uncertain]);
  if (!top.length) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stop has enough departures to rank.</p>;
  return (
    <div className="mt-4 overflow-x-auto">
      <SortableDataTable
        caption="Stops ranked by the share of late departures"
        defaultSort="late"
        rows={top}
        rowKey={s => `${s.stopId}-${s.directionId}`}
        columns={[
          { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => !canPick(s.directionId, s.stopId) ? s.name : <button type="button" onClick={() => onPick(s.directionId, s.stopId)} className="text-left font-[inherit] hover:underline">{s.name}</button> },
          ...(dir == null ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof top)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
          { key: 'late', header: 'Late', worst: s => s.lateShare, cell: s => (
            <span className="inline-flex items-center gap-2">
              <span className="block h-2 w-20 rounded-sm bg-[var(--control-inactive-bg)]" aria-hidden="true"><span className="block h-full rounded-sm bg-[var(--accent)] opacity-90" style={{ width: `${Math.max(2, s.lateShare * 100)}%` }} /></span>
              {pct(s.lateShare)}
            </span>
          ) },
          { key: 'median', header: 'Typical delay', worst: s => s.medianMin, cell: s => mins(s.medianMin) },
          { key: 'p90', header: '1 in 10 later than', worst: s => s.p90Min, cell: s => mins(s.p90Min) },
          { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
        ]}
      />
    </div>
  );
}

function ExtraWait({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const all = v3.extraWait?.[band];
  if (!all) return null;
  if (all.length === 0) return <p className="mt-3 text-sm text-[var(--text-muted)]">No stop on this route has a vehicle every 15 minutes or better in this time of day.</p>;
  const dirs = dirsOf(v3, dir);
  const pointsOf = (d: number): ProfilePoint[] => all.filter(s => s.directionId === d).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: Math.max(0, s.extraWaitMin), n: s.gaps }));
  const scale = sharedScale(dirs.map(pointsOf));
  const worst = all.filter(s => (dir == null || s.directionId === dir) && s.gaps >= 30).sort((a, b) => b.extraWaitMin - a.extraWaitMin).slice(0, 10);
  return (
    <>
      <div className={`mt-4 grid gap-x-10 gap-y-8 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {dirs.map(d => {
          const label = v3.directionLabels[String(d)];
          const points = pointsOf(d);
          return (
            <div key={d} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              {points.length > 1 && (
                <ProfileBars
                  ariaLabel={`${label}: extra wait at each stop along the route.`}
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
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => s.name },
              ...(dir == null ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof worst)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
              { key: 'extra', header: 'Extra wait', worst: s => s.extraWaitMin, cell: s => `${num(s.extraWaitMin)} min` },
              { key: 'sched', header: 'Scheduled every', cell: s => `${num(s.scheduledGapMin)} min` },
              { key: 'n', header: 'Gaps', cell: s => s.gaps.toLocaleString() },
            ]}
          />
        </div>
      )}
    </>
  );
}

function Bunching({ v3, dir, band }: { v3: LiveV3; dir: number | null; band: DashboardBand }) {
  const rows = v3.bunching.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  const pointsOf = (data: (typeof rows)[number]['bands'][string]): ProfilePoint[] => data.stops.filter(s => s.n >= 10).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: s.bunchedShare, y2: s.gappedShare, n: s.n }));
  const scale = sharedScale(rows.flatMap(b => (b.bands[band] ? [pointsOf(b.bands[band])] : [])));
  return (
    <div className={`mt-4 grid gap-x-10 gap-y-8 ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {rows.map(b => {
        const label = v3.directionLabels[String(b.directionId)];
        const data = b.bands[band];
        if (!data) return null;
        const points = pointsOf(data);
        const stretch = data.forms ?? data.biggestRise;
        const markIdx = stretch ? points.findIndex(p => p.label === data.stops.find(s => s.stopId === stretch.toStopId)?.name) : -1;
        return (
          <div key={b.directionId} className="min-w-0">
            <h3 className="text-base font-black">{label}</h3>
            {points.length > 1 && (
              <ProfileBars
                ariaLabel={`${label}: share of gaps that are too close together or too far apart, stop by stop.`}
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
          </div>
        );
      })}
    </div>
  );
}

function Delivered({ v3, dir }: { v3: LiveV3; dir: number | null }) {
  const sd = v3.serviceDelivered;
  if (!sd) return null;
  const overall = dir == null ? sd.overall : sd.overall.byDirection[String(dir)];
  const days = sd.byDay.filter(d => d.healthy);
  const points: ProfilePoint[] = days.map(d => ({ label: dateRangeText(d.date, d.date), y: dir == null ? d.share ?? 0 : d.byDirection[String(dir)] ?? 0, n: d.seen + d.notSeen }));
  if (points.length < 2) return null;
  return (
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      {overall?.share != null && (
        <div className={TILE}>
          <div className="text-xs font-bold text-[var(--text-muted)]">Ran</div>
          <div className="mt-1 text-3xl font-black tracking-tight">{Math.round(overall.share * 1000) / 10}%</div>
          <div className="mt-1 text-xs text-[var(--text-dim)]">{(overall.seen + overall.notSeen).toLocaleString()} trips</div>
        </div>
      )}
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
  );
}

export default function LiveExplorePage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(FEATURES.liveReports ? agency : null, route);
  const [dir, setDir] = useState<number | null>(() => { const d = readParam('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  const [day, setDay] = useState<Day>(() => { const d = readParam('day'); return d === 'weekday' || d === 'weekend' ? d : 'all'; });
  const [band, setBand] = useState<DashboardBand>(() => { const b = readParam('band'); return BANDS.some(([k]) => k === b) ? (b as DashboardBand) : 'all'; });
  const [picked, setPicked] = useState<Selection | null>(null);
  useEffect(() => { syncUrlParams({ view: 'explore', dir: dir == null ? null : String(dir), day: day === 'all' ? null : day, band: band === 'all' ? null : band }); }, [dir, day, band]);
  const routeTitle = state.kind === 'done' && state.data.status === 'ready' ? state.data.routeTitle : null;
  useEffect(() => {
    if (!agency || !route) return;
    applySeoToDocument(document, { title: liveReportTitle(routeTitle || `${agency.toUpperCase()} ${route}`), description: '', canonicalUrl: `${ATLAS_MODE === 'public' ? SITE_URL : window.location.origin}${window.location.pathname}`, noindex: true, matchedPath: window.location.pathname });
  }, [agency, route, routeTitle]);
  if (!FEATURES.liveReports) return <LiveOffNotice />;
  const title = `${agency.toUpperCase()} ${route}`;
  const back = FEATURES.live ? <ArrowLink href="/apps/live" className="mt-6">Open Live</ArrowLink> : null;
  const shell = (body: ReactNode) => <PageShell variant="wide" maxWidth="max-w-[1600px]">{body}</PageShell>;
  if (state.kind === 'loading') return shell(<p className="mt-24 text-sm text-[var(--text-muted)]" aria-busy="true">Loading {title}…</p>);
  if (state.kind === 'error') return shell(<><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{state.reason}</p>{back}</>);
  const data = state.data;
  if (data.status !== 'ready') {
    return shell(<><PageTitle className="mt-24">{title}</PageTitle><p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{data.status === 'no_analysis' ? devOnly(data.reason) : data.reason}</p>{back}</>);
  }
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const bandData = v3.bands?.[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];

  // The strip opens on where delay builds up when the route has such a stretch, else on its first stop.
  const firstDir = dirsOf(v3, dir)[0];
  const fallback: Selection = (() => {
    for (const d of dirsOf(v3, dir)) {
      if (bandData.buildup.find(b => b.directionId === d)?.forms) return { dir: d, kind: 'stretch', mode: 'delay' } as Selection;
    }
    const first = [...directionStopsById(v3, firstDir, band, uncertain).keys()][0];
    return { dir: firstDir, kind: 'stop', stopId: first };
  })();
  const sel: Selection = (() => {
    if (!picked || (dir != null && picked.dir !== dir)) return fallback;
    if (picked.kind === 'stretch') {
      const ok = picked.mode === 'delay' ? bandData.buildup.find(b => b.directionId === picked.dir)?.forms : v3.bunching.find(b => b.directionId === picked.dir)?.bands[band]?.forms;
      return ok ? picked : fallback;
    }
    return picked;
  })();

  // A stop picked in a table opens in the panel, and the strip scrolls into view.
  // Stops off the strip's usual pattern are not on it, so their names stay plain text.
  const onStrip = (d: number, stopId: string) => directionStopsById(v3, d, band, uncertain).has(stopId);
  const pickStop = (d: number, stopId: string) => {
    if (!onStrip(d, stopId)) return;
    setPicked({ dir: d, kind: 'stop', stopId });
    document.getElementById('x-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return shell(
    <article className="pb-16 pt-10 sm:pt-14">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <PageTitle>{title}: how it is running</PageTitle>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {v3.window.dates.length ? `${weekOfText(v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1])} · ` : ''}{v3.totals.runs.toLocaleString()} trips · estimated from where vehicles were, not reported by {agency.toUpperCase()}
          </p>
        </div>
        {FEATURES.live && <ArrowLink href="/apps/live">View on Live map</ArrowLink>}
      </div>
      {(() => {
        const f = freshness(v3, route, Date.now());
        return f.stale ? <p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{withoutDevHint(f.text)}</p> : null;
      })()}
      {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}

      <ErrorBoundary label={BOUNDARY('This week compared with last week')}><KpiRow v3={v3} /></ErrorBoundary>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3" role="group" aria-label="Filters">
        <Group label="Direction" value={dir == null ? 'both' : String(dir)} onChange={v => setDir(v === 'both' ? null : Number(v))}
          options={[['both', 'Both directions'], ...dirsOf(v3, null).map(d => [String(d), v3.directionLabels[String(d)]] as const)]} />
        <Group label="Time of day" value={band} onChange={v => setBand(v as DashboardBand)} options={BANDS} />
      </div>

      <ErrorBoundary label={BOUNDARY('Along the route')}>
        <Main v3={v3} band={band} dir={dir} uncertain={uncertain} sel={sel} setSel={setPicked} />
      </ErrorBoundary>

      <Section id="x-late" title="How well it keeps to its timetable">
        <div className="mt-3"><Group label="Day" value={day} onChange={v => setDay(v as Day)} options={DAYS} /></div>
        <ErrorBoundary label={BOUNDARY('How well it keeps to its timetable')}><Late data={bandData} dir={dir} day={day} band={band} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
      </Section>
      <Section id="x-runtime" title="Run time">
        <ErrorBoundary label={BOUNDARY('Run time')}><RunTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
      </Section>
      <Section id="x-buildup" title="Where delays build up">
        <ErrorBoundary label={BOUNDARY('Where delays build up')}><Buildup v3={v3} data={bandData} dir={dir} uncertain={uncertain} /></ErrorBoundary>
      </Section>
      <Section id="x-wait" title="Extra wait">
        <ErrorBoundary label={BOUNDARY('Extra wait')}><ExtraWait v3={v3} band={band} dir={dir} /></ErrorBoundary>
      </Section>
      <Section id="x-bunching" title="Where bunching forms">
        <ErrorBoundary label={BOUNDARY('Where bunching forms')}><Bunching v3={v3} dir={dir} band={band} /></ErrorBoundary>
      </Section>
      <Section id="x-delivered" title="Service delivered">
        <ErrorBoundary label={BOUNDARY('Service delivered')}><Delivered v3={v3} dir={dir} /></ErrorBoundary>
      </Section>
      <Section id="x-stops" title="Stops with the most delay">
        <ErrorBoundary label={BOUNDARY('Stops with the most delay')}><WorstStops v3={v3} data={bandData} dir={dir} uncertain={uncertain} onPick={pickStop} canPick={onStrip} /></ErrorBoundary>
      </Section>
      <ErrorBoundary label="How this is measured could not be drawn."><Method data={data} /></ErrorBoundary>
    </article>,
  );
}
