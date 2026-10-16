import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { FEATURES, periodKeyForHour } from '../shared/config';
import {
  LINK_LABELS, NOISE_RULE, bunchingSentence, buildupTakeaway, compareTiles, weekDailyValues, dateRangeText, deliveredSentence, extraWaitSentence, freshness, buildupSentence, linkValueText, rankStops, runningTimeSentence, toCsv,
  type DashboardBand, type DashboardBandData, type DashboardBunchingBand, type LiveDashboardResponse, type LiveV3, type UncertainStart,
} from '../shared/liveDashboard';
import { useLiveDashboard } from './hooks/useLiveDashboard';
import { syncUrlParams } from './utils/syncUrlParams';
import { titleCase } from './utils/format';
import { isMajorStop, shortStopName } from './utils/stopLabel';
import ErrorBoundary from './components/ErrorBoundary';
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import Pill from './components/ui/Pill';
import LiveOffNotice from './components/LiveOffNotice';
import LiveDashboardView from './LiveDashboardView';
import ProfileBars, { sharedScale, type ProfilePoint } from './components/charts/ProfileBars';
import HourBars from './components/charts/HourBars';
import { PAGE_ACTION, TILE } from './pageStyles';

type Day = 'all' | 'weekday' | 'weekend';
const DAYS: [Day, string][] = [['all', 'All days'], ['weekday', 'Weekdays'], ['weekend', 'Weekends']];
const BANDS: [DashboardBand, string][] = [['all', 'All day'], ['amPeak', 'AM peak'], ['midday', 'Midday'], ['pmPeak', 'PM peak'], ['evening', 'Evening']];
const MINUS = '−';

/** Stop names come upper-case or mixed from the feed; show them the way the map does. */
function withNiceNames(v3: LiveV3): LiveV3 {
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

type Ready = Extract<LiveDashboardResponse, { status: 'ready' }>;

function downloadCsv(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

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

function Filters({ v3, band, setBand, dir, setDir }: { v3: LiveV3; band: DashboardBand; setBand: (b: DashboardBand) => void; dir: number | null; setDir: (d: number | null) => void }) {
  const dirs = Object.keys(v3.directionLabels).map(Number).sort();
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3" role="group" aria-label="Filters">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Direction">
        <Pill size="segment" selected={dir == null} onClick={() => setDir(null)}>Both directions</Pill>
        {dirs.map(d => <Pill key={d} size="segment" selected={dir === d} onClick={() => setDir(d)}>{v3.directionLabels[String(d)]}</Pill>)}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Time of day">
        {BANDS.map(([k, label]) => <Pill key={k} size="segment" selected={band === k} onClick={() => setBand(k)}>{label}</Pill>)}
      </div>
    </div>
  );
}

/** B1: how well the route keeps to its timetable, at timepoints (where the timetable really schedules a time). */
function Adherence({ data, band, dir, lateMin }: { data: DashboardBandData; band: DashboardBand; dir: number | null; lateMin: number }) {
  const v3Late = lateMin;
  const [day, setDay] = useState<Day>(() => { const d = new URLSearchParams(window.location.search).get('day'); return d === 'weekday' || d === 'weekend' ? d : 'all'; });
  useEffect(() => { syncUrlParams({ day: day === 'all' ? null : day }); }, [day]);
  const block = data.adherence.timepoints[day];
  const countsFor = (d: Day) => { const b = data.adherence.timepoints[d]; return dir == null ? b.overall : b.byDirection[String(dir)]; };
  const counts = countsFor(day);
  const all = countsFor('all');
  // Hours are only drawn for the chosen time of day: the others have no departures in this view.
  return (
    <Section id="b1" title="How well it keeps to its timetable">
      {all && all.n > 0 ? (
        <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Share of departures {v3Late}+ minutes late, at the stops where the timetable gives a time.</p>
          <div className="mt-3 grid max-w-2xl grid-cols-3 gap-2">
            {DAYS.map(([k, label]) => {
              const c = countsFor(k);
              return c && c.n > 0
                ? <Tile key={k} label={label} value={pct(c.lateShare)} sub={`late, of ${c.n.toLocaleString()} · ${pct(c.earlyShare)} ahead`} />
                : <Tile key={k} label={label} value="–" sub="too few departures" />;
            })}
          </div>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
            <h3 className="text-base font-black">By hour of the day</h3>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days for the hourly chart">
              {DAYS.map(([k, label]) => <Pill key={k} size="segment" selected={day === k} onClick={() => setDay(k)}>{label}</Pill>)}
            </div>
          </div>
          <HourBars
            ariaLabel={`Share of departures ahead of the timetable, on time and late, by hour of the day. ${counts ? pct(counts.lateShare) : '–'} late overall.`}
            parts={[{ name: 'Ahead', color: 'var(--status-caution-text)' }, { name: 'On time', color: 'var(--status-positive-text)' }, { name: 'Late', color: 'var(--status-negative-text)' }]}
            columns={block.byHour.filter(h => band === 'all' || h.n > 0).map(h => ({ hour: h.hour, n: h.n, parts: [h.earlyShare, h.onTimeShare, h.lateShare] }))}
          />
        </>
      ) : <p className="mt-3 text-sm text-[var(--text-muted)]">Not enough departures at stops with a scheduled time for this choice.</p>}
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
  const csvRows = rows.flatMap(b => b.stretches.map(s => [v3.directionLabels[String(b.directionId)], s.fromName, s.toName, s.medianAddedMin, s.growShare, s.medianDelayMin, s.n]));
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
                axisTitle="Minutes late leaving the stop (below the line: early)"
                points={points}
                formatY={axisMin}
                unit="trips"
                valueHeader="Typical delay"
                caption="Each bar is the typical delay at a stop. The spread (1 in 10 earliest and latest) is in the table."
                whiskers={false}
                zero
                zeroLabel="On time"
                scale={scale}
                lessExactNote="the first stops, where vehicle positions arrive less often (in the tunnel), so the delay there is less exact."
                marks={marked >= 0 ? [{ index: marked, label: `Builds up by ${points[marked].short}` }] : []}
              />
              <div className="mt-3 overflow-x-auto">
                <DataTable
                  caption={`${label}: the stretches that add the most delay`}
                  rows={worst}
                  rowKey={s => `${s.fromStopId}-${s.toStopId}`}
                  columns={[
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, className: 'font-normal', cell: s => `${s.fromName} to ${s.toName}` },
                    { key: 'added', header: 'Typical added', className: 'whitespace-nowrap', cell: s => mins(s.medianAddedMin) },
                    { key: 'grows', header: 'Trips where it grows', className: 'whitespace-nowrap', cell: s => `${pct(s.growShare)} of ${s.n.toLocaleString()}` },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>
      {csvRows.length > 0 && (
        <p className="mt-3"><Pill tone="outline" onClick={() => downloadCsv('delay-by-stretch.csv', toCsv(['Direction', 'From', 'To', 'Typical added delay (min)', 'Share of trips where delay grows 30+ s', 'Typical delay at the end of the stretch (min)', 'Trips'], csvRows))}>Download the stretches as CSV</Pill></p>
      )}
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
          <DataTable
            caption="Stops ranked by the share of late departures"
            rows={top}
            rowKey={s => `${s.stopId}-${s.directionId}`}
            columns={[
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => s.name },
              ...(both ? [{ key: 'dir', header: 'Direction', className: 'whitespace-nowrap', cell: (s: (typeof top)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
              { key: 'late', header: 'Late', className: 'whitespace-nowrap', cell: s => (
                <span className="inline-flex items-center gap-2">
                  <span className="block h-2 w-20 rounded-sm bg-[var(--control-inactive-bg)]" aria-hidden="true"><span className="block h-full rounded-sm bg-[var(--accent)] opacity-90" style={{ width: `${Math.max(2, s.lateShare * 100)}%` }} /></span>
                  {pct(s.lateShare)}
                </span>
              ) },
              { key: 'median', header: 'Typical delay', className: 'whitespace-nowrap', cell: s => mins(s.medianMin) },
              { key: 'p90', header: '1 in 10 later than', className: 'whitespace-nowrap', cell: s => mins(s.p90Min) },
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
      {top.length > 0 && (
        <p className="mt-3"><Pill tone="outline" onClick={() => downloadCsv('stops-by-late-share.csv', toCsv(['Stop', 'Direction', 'Share of departures late', 'Typical delay (min)', 'Delay 1 in 10 exceed (min)', 'Departures'], ranked.map(s => [s.name, v3.directionLabels[String(s.directionId)], s.lateShare, s.medianMin, s.p90Min, s.n])))}>Download the stops as CSV</Pill></p>
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
                  caption="Share of gaps between vehicles that are too close together or too far apart, stop by stop."
                  axisTitle="Share of gaps off the timetable"
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
  const w = v3.weekly;
  if (!w) return null;
  const range = (dates: string[]) => (dates.length ? dateRangeText(dates[0], dates[dates.length - 1]) : 'no days');
  const chip = {
    better: 'bg-[var(--status-positive-bg,transparent)] text-[var(--status-positive-text)] border-[var(--status-positive-text)]',
    worse: 'bg-[var(--status-negative-bg,transparent)] text-[var(--status-negative-text)] border-[var(--status-negative-text)]',
    same: 'text-[var(--text-muted)] border-[var(--border-primary)]',
    unknown: 'text-[var(--text-dim)] border-[var(--border-primary)]',
  } as const;
  const word = { better: 'better', worse: 'worse', same: 'about the same', unknown: '' } as const;
  return (
    <Section id="week" title="This week compared with last week">
      {w.comparable ? (
        <>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{range(w.thisWeek.dates)} against {range(w.lastWeek.dates)}. Coloured only where the change is bigger than usual day to day.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {compareTiles(w, weekDailyValues(v3)).map(t => (
              <li key={t.key} className={`${TILE} !p-3`} aria-label={`${t.label}: ${t.value}${t.before ? `, last week ${t.before}, ${word[t.direction]}` : ''}`}>
                <div className="text-2xl font-black tracking-tight">{t.value}</div>
                <div className="mt-0.5 text-xs font-bold text-[var(--text-muted)]">{t.label}</div>
                {t.delta && (
                  <span className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${chip[t.direction]}`} title={`Last week ${t.before}: ${t.why}`}>
                    {t.delta}{t.direction === 'same' ? ' · same' : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">Not enough days of good recordings to compare two weeks: each week needs at least {w.minHealthyDays}.</p>}
    </Section>
  );
}

/** How long the whole trip takes against the timetable, by direction and hour. */
function RunningTime({ v3, band, dir }: { v3: LiveV3; band: DashboardBand; dir: number | null }) {
  const rt = v3.runningTime;
  if (!rt) return null;
  const dirs = Object.keys(v3.directionLabels).map(Number).sort().filter(d => dir == null || d === dir);
  const pointsOf = (d: number): ProfilePoint[] => (rt.byHour[String(d)] ?? [])
    .filter(h => band === 'all' || periodKeyForHour(h.hour) === band)
    .map(h => ({ label: hourLabel(h.hour), y: h.typicalMin, ref: h.scheduledMin, hi: h.p90Min, lo: h.typicalMin, n: h.n }));
  const scale = sharedScale(dirs.map(d => pointsOf(d).map(p => ({ ...p, y: Math.max(p.y, p.hi ?? 0, p.ref ?? 0) }))));
  return (
    <Section id="runtime" title="How long the trip takes">
      <p className="mt-2 text-sm text-[var(--text-muted)]">End-to-end trip time by the hour the trip starts, against the timetable.</p>
      <div className={`mt-4 grid gap-6 ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {dirs.map(d => {
          const label = v3.directionLabels[String(d)];
          const figures = rt.bands[band]?.[String(d)];
          const points = pointsOf(d).filter(p => (p.n ?? 0) >= 1);
          return (
            <div key={d} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              <p className="mt-1 text-sm leading-6">{runningTimeSentence(label, figures)}</p>
              {points.length > 1 && (
                <ProfileBars
                  ariaLabel={`${label}: typical trip time by hour the trip starts, against the timetable. ${runningTimeSentence(label, figures)}`}
                  points={points}
                  formatY={y => `${Math.round(y)} min`}
                  unit="trips"
                  valueHeader="Typical trip time"
                  refHeader="Scheduled"
                  rowHeader="Starts at"
                  caption="Each bar is the typical trip time for trips starting that hour, the black tick is the timetable, and the faint line reaches the time that 1 in 10 trips exceed."
                  axisTitle="Minutes from first stop to last"
                  scale={{ min: 0, max: scale.max }}
                />
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
                      caption="Extra wait at each stop along the route."
                      axisTitle="Extra minutes of waiting"
                      scale={scale}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {worst.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <DataTable
                caption="Stops where riders wait longest compared with the timetable"
                rows={worst}
                rowKey={s => `${s.stopId}-${s.directionId}`}
                columns={[
                  { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => s.name },
                  ...(dir == null ? [{ key: 'dir', header: 'Direction', className: 'whitespace-nowrap', cell: (s: (typeof worst)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
                  { key: 'extra', header: 'Extra wait', className: 'whitespace-nowrap', cell: s => `${num(s.extraWaitMin)} min` },
                  { key: 'sched', header: 'Scheduled every', className: 'whitespace-nowrap', cell: s => `${num(s.scheduledGapMin)} min` },
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
            caption="Share of scheduled trips that ran, day by day."
            scale={{ min: 0.9, max: 1 }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--text-dim)]">The bars start at 90%.{skipped.length > 0 && <> Not counted: {skipped.map(d => dateRangeText(d.date, d.date)).join(', ')} (gaps in our recordings).</>}</p>
    </Section>
  );
}

function Method({ data }: { data: Ready }) {
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
        {v3.weekly && <li>This week compared with last week: days with gaps in our recordings are left out of both weeks (this week {v3.weekly.thisWeek.healthyDates.length} of {v3.weekly.thisWeek.dates.length} days, last week {v3.weekly.lastWeek.healthyDates.length} of {v3.weekly.lastWeek.dates.length}). {NOISE_RULE}</li>}
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

const BOUNDARY = (what: string) => `${what} could not be drawn: the analysis file may be from an older version. Rebuild it with npm run live:analyze.`;

export default function LiveRoutePage() {
  const { agency = '', route = '' } = useParams();
  const state = useLiveDashboard(agency, route);
  const [band, setBand] = useState<DashboardBand>(() => { const b = new URLSearchParams(window.location.search).get('band'); return BANDS.some(x => x[0] === b) ? (b as DashboardBand) : 'all'; });
  const [dir, setDir] = useState<number | null>(() => { const d = new URLSearchParams(window.location.search).get('dir'); return d != null && d !== '' && !Number.isNaN(Number(d)) ? Number(d) : null; });
  // The filters live in the address, so a link reopens the same view.
  useEffect(() => { syncUrlParams({ band: band === 'all' ? null : band, dir: dir == null ? null : String(dir) }); }, [band, dir]);
  // The dashboard is the default; ?view=analysis is the full page.
  const [view, setView] = useState<'dashboard' | 'analysis'>(() => (new URLSearchParams(window.location.search).get('view') === 'analysis' ? 'analysis' : 'dashboard'));
  useEffect(() => { syncUrlParams({ view: view === 'analysis' ? 'analysis' : null }); }, [view]);
  useEffect(() => {
    if (view !== 'analysis' || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [view, state.kind]);
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
  // A malformed file must not blank the page: fall back to the raw names and let each section's boundary report its own problem.
  const v3 = (() => { try { return withNiceNames(data.v3); } catch { return data.v3; } })();
  const bandData = v3.bands?.[band] as DashboardBandData;
  const uncertain = data.uncertainStart ?? [];
  return (
    <PageShell variant="wide">
      <article className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}: how it is running</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {v3.window.dates.length ? `${dateRangeText(v3.window.dates[0], v3.window.dates[v3.window.dates.length - 1])} · ` : ''}{v3.totals.runs.toLocaleString()} trips · estimated from where vehicles were, not reported by {agency.toUpperCase()}
            </p>
          </div>
          <a href="/apps/live" className={PAGE_ACTION}>View on Live map <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
        {(() => {
          const f = freshness(v3, route, Date.now());
          return f.stale ? <p className="mt-2 text-sm font-bold text-[var(--status-caution-text)]" role="status">{f.text}</p> : null;
        })()}
        {data.note && <p className="mt-4 max-w-3xl text-sm font-bold text-[var(--status-caution-text)]">{data.note}</p>}
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="View">
          <Pill size="segment" selected={view === 'dashboard'} onClick={() => setView('dashboard')}>Dashboard</Pill>
          <Pill size="segment" selected={view === 'analysis'} onClick={() => setView('analysis')}>Full analysis</Pill>
        </div>
        {view === 'dashboard' ? (
          <LiveDashboardView v3={v3} data={bandData} band={band} dir={dir} uncertain={uncertain} note={data.note} title={title}
            filters={<Filters v3={v3} band={band} setBand={setBand} dir={dir} setDir={setDir} />}
            toFull={hash => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`); setView('analysis'); }} />
        ) : (<>
        <Filters v3={v3} band={band} setBand={setBand} dir={dir} setDir={setDir} />
        <ErrorBoundary label={BOUNDARY('This week compared with last week')}><WeekCompare v3={v3} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('How well it keeps to its timetable')}><Adherence data={bandData} band={band} dir={dir} lateMin={v3.thresholds.lateAtOrAboveMin} /></ErrorBoundary>
        <ErrorBoundary label={BOUNDARY('How long the trip takes')}><RunningTime v3={v3} band={band} dir={dir} /></ErrorBoundary>
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
