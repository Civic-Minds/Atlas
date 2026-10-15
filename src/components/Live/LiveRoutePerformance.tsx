import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useSegmentDelay } from '../../hooks/useSegmentDelay';
import { syncUrlParams } from '../../utils/syncUrlParams';
import { periodKeyForHour } from '../../../shared/config';
import {
  MIN_DAYS, MIN_SEGMENT_TRIPS, SEGMENT_BAND_OPTIONS, halfMinutes, halfMinutesDown, stopNameParts, usableStandingStill,
  type SegmentBand, type SegmentDelayData,
} from '../../utils/segmentDelayView';
import {
  extraWaitRun, lineModel, liveGaps, type RecentSnapshot, placeOnLine, runningTimeTally, sharedSummary, stretchBetween, stretchForRow, stripStops, withStats,
  type LineModel, type LineStop, type Stretch,
} from '../../utils/livePerformance';

function halfText(m: number): string {
  const whole = Math.floor(Math.abs(m));
  const half = Math.abs(m) - whole >= 0.5;
  return `${m < 0 ? '−' : ''}${whole === 0 && half ? '' : whole}${half ? '½' : ''}`;
}

/** "3½", "10", "½" — minutes to the nearest ½. */
export function mins(sec: number): string {
  return halfText(halfMinutes(sec));
}

/**
 * A range of gaps in ½ min steps, widened outward (low end down, high end up) so the
 * shown range never looks tighter than the data: 1.3–9.1 min reads "1–9½".
 */
export function minsRange(lowSec: number, highSec: number): string {
  return `${halfText(Math.floor(lowSec / 30) / 2)}–${halfText(Math.ceil(highSec / 30) / 2)}`;
}

/** The timetable's gap: one value, or a range when the period mixes headways ("8–14"). */
export function schedText(st: { scheduledMedianGapSec: number; scheduledP10Sec?: number; scheduledP90Sec?: number }): string {
  const lo = st.scheduledP10Sec, hi = st.scheduledP90Sec;
  if (lo == null || hi == null || mins(lo) === mins(hi)) return mins(st.scheduledMedianGapSec);
  return `${mins(lo)}–${mins(hi)}`;
}

const HEAD = 'text-xs font-black text-[var(--text-dim)]';
const ROW_LABEL = 'text-xs font-bold text-[var(--text-primary)] truncate';
const DETAIL = 'text-xs font-bold text-[var(--text-muted)] tabular-nums leading-snug';
const NUM = 'text-xs font-bold text-[var(--text-muted)] tabular-nums whitespace-nowrap';
const AMBER = 'var(--status-caution-text)';

function torontoHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Toronto' }).format(d));
}

function torontoTime(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' }).format(d).replace('a.m.', 'am').replace('p.m.', 'pm');
}

function currentBand(): SegmentBand {
  const key = periodKeyForHour(torontoHour());
  return SEGMENT_BAND_OPTIONS.some(o => o.id === key) ? (key as SegmentBand) : 'all';
}

/** The period now, when the archive has it (late night included), else all day. */
function livePeriod(data: SegmentDelayData): SegmentBand {
  const key = periodKeyForHour(torontoHour());
  return key && (data.headways ?? []).some(h => h.bands[key]) ? (key as SegmentBand) : 'all';
}

function shortDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <button
          key={String(o.id)}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors ${
            value === o.id
              ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-secondary)]'
              : 'border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 pt-3 border-t border-[var(--border-primary)]">
      <div className={HEAD}>{title}</div>
      {children}
    </div>
  );
}

/** One strip row: scheduled tick, the 8-in-10 range bar, and the typical dot, on a shared minute scale. */
function GapBar({ stop, scaleSec }: { stop: LineStop; scaleSec: number }) {
  const s = stop.stat!;
  const pct = (sec: number) => `${Math.min(100, (sec / scaleSec) * 100)}%`;
  return (
    <div className="relative h-3 flex-1 min-w-0" aria-hidden>
      <div className="absolute top-1/2 left-0 right-0 h-px bg-[var(--border-primary)]" />
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[var(--accent)] opacity-35"
        style={{ left: pct(s.gapP10Sec), width: `calc(${pct(s.gapP90Sec)} - ${pct(s.gapP10Sec)})` }}
      />
      <div className="absolute top-0 bottom-0 w-0.5 -ml-px bg-[var(--text-primary)]" style={{ left: pct(s.scheduledMedianGapSec) }} />
      <div className="absolute top-1/2 w-2 h-2 -ml-1 -translate-y-1/2 rounded-full bg-[var(--accent)]" style={{ left: pct(s.actualMedianGapSec) }} />
    </div>
  );
}

function scaleFor(stops: LineStop[]): number {
  const max = Math.max(...stops.map(s => s.stat!.gapP90Sec), ...stops.map(s => s.stat!.scheduledMedianGapSec));
  return Math.ceil(max / 120) * 120;
}

function GapStrip({ stops, onRow, activeIndex }: { stops: LineStop[]; onRow?: (i: number) => void; activeIndex?: number | null }) {
  if (stops.length === 0) return <div className="text-xs text-[var(--text-muted)]">Not enough gaps measured in this period.</div>;
  const scale = scaleFor(stops);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 pb-0.5">
        <span className="w-[30%] shrink-0" />
        <div className="relative flex-1 h-3 text-[10px] font-bold text-[var(--text-dim)] tabular-nums">
          <span className="absolute left-0">0</span>
          <span className="absolute right-0">{Math.round(scale / 60)} min</span>
        </div>
        <span className="w-[3.75rem] shrink-0" />
      </div>
      {stops.map((s, i) => (
        <button
          key={s.stopId}
          type="button"
          onClick={onRow ? () => onRow(i) : undefined}
          disabled={!onRow}
          className={`flex items-center gap-2 py-1 -mx-1 px-1 rounded text-left ${onRow ? 'hover:bg-[var(--bg-secondary)]' : 'cursor-default'} ${activeIndex === i ? 'bg-[var(--bg-secondary)]' : ''}`}
        >
          <span className={`${ROW_LABEL} w-[30%] shrink-0`} title={stopLabel(s.name)}>{s.label}</span>
          <GapBar stop={s} scaleSec={scale} />
          <span className={`${NUM} w-[3.75rem] shrink-0 text-right`}>{minsRange(s.stat!.gapP10Sec, s.stat!.gapP90Sec)}</span>
        </button>
      ))}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-1 text-[10px] font-bold text-[var(--text-dim)]">
        <span className="inline-flex items-center gap-1"><span className="w-0.5 h-2.5 bg-[var(--text-primary)]" />scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-[var(--accent)] opacity-35" />8 in 10 gaps</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--accent)]" />typical</span>
      </div>
    </div>
  );
}

function Figures({ items }: { items: (string | null)[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-bold text-[var(--text-primary)] tabular-nums">
      {items.filter(Boolean).map((t, i, arr) => (
        <span key={i} className="whitespace-nowrap">{t}{i < arr.length - 1 && <span className="text-[var(--text-dim)] ml-2">·</span>}</span>
      ))}
    </div>
  );
}

/** A row of small labelled figures. */
function Stats({ items }: { items: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="text-[10px] font-bold text-[var(--text-dim)] truncate">{label}</div>
          <div className="text-sm font-black text-[var(--text-primary)] tabular-nums whitespace-nowrap">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Plain({ text }: { text: string }) {
  return <div className="text-xs font-bold text-[var(--text-primary)] leading-snug">{text}</div>;
}

function StillRows({ rows, totalDays }: { rows: ReturnType<typeof usableStandingStill>; totalDays: number }) {
  if (rows.length === 0) return <div className="text-xs text-[var(--text-muted)]">None regularly in this period.</div>;
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(r => (
        <div key={`${r.stop.stopId}|${r.stop.directionId}`} className="flex items-center gap-2">
          <span className={`${ROW_LABEL} flex-1 min-w-0`}>{stopLabel(r.stop.stopName)}</span>
          <span className={`${NUM} w-10 text-right`}>{r.events}×</span>
          <span className={`${NUM} w-[5.5rem] text-right`}>{r.days} of {totalDays} days</span>
        </div>
      ))}
    </div>
  );
}

const stopLabel = (name: string) => stopNameParts(name).short;

interface Props {
  slug: string;
  routeShortName: string;
  /** Live feed is down, stale or incomplete: "Right now" is hidden. */
  feedDegraded: boolean;
  onZoom: (bounds: [number, number, number, number]) => void;
  onHighlight: (coordinates: [number, number][] | null) => void;
  /** Register a handler for clicks on the map (lon, lat); the card turns a click on the line into a stretch. */
  registerMapClick: (fn: ((lonLat: [number, number], toleranceM: number) => void) | null) => void;
  /** Full-panel Details screen open/closed, so the parent can hide its other content. */
  onDetailsChange?: (open: boolean) => void;
}

type Screen = { kind: 'card' } | { kind: 'stretch'; from: number; to: number; row: number | null } | { kind: 'details' };

/** The Live route card: how the route's spacing holds up, now and over the archive. */
export default function LiveRoutePerformance({ slug, routeShortName, feedDegraded, onZoom, onHighlight, registerMapClick, onDetailsChange }: Props) {
  const data = useSegmentDelay(slug, routeShortName) as (SegmentDelayData & { tripDirections?: Record<string, string[]> }) | null;
  // View state lives in the URL (p, dir, stretch, view) so a shared link reopens it.
  const [initial] = useState(() => new URLSearchParams(window.location.search));
  const [band, setBand] = useState<SegmentBand>(() => {
    const p = initial.get('p');
    return SEGMENT_BAND_OPTIONS.some(o => o.id === p) ? (p as SegmentBand) : currentBand();
  });
  const directions = useMemo(() => Object.entries(data?.directionLabels ?? {}).map(([id, label]) => ({ id: Number(id), label })), [data]);
  const [dir, setDir] = useState<number | null>(() => (initial.get('dir') != null && !Number.isNaN(Number(initial.get('dir'))) ? Number(initial.get('dir')) : null));
  const directionId = directions.some(d => d.id === dir) ? dir! : directions[0]?.id ?? 0;
  const [screen, setScreen] = useState<Screen>(() => (initial.get('view') === 'details' ? { kind: 'details' } : { kind: 'card' }));
  const pendingStretch = React.useRef<string | null>(initial.get('stretch'));
  const [now, setNow] = useState(() => Date.now());
  // The last 30 min of archived positions for this route, refreshed every 30 s (archive is written each minute).
  const [recent, setRecent] = useState<RecentSnapshot[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`/api/live-recent?agency=${encodeURIComponent(slug)}&route=${encodeURIComponent(routeShortName)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) { setRecent(Array.isArray(j?.snapshots) ? j.snapshots : null); setNow(Date.now()); } })
      .catch(() => { if (!cancelled) setRecent(null); });
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [slug, routeShortName]);

  const line: LineModel | null = useMemo(() => (data ? lineModel(data, directionId) : null), [data, directionId]);
  const stops = useMemo(() => (line ? withStats(line, band) : []), [line, band]);
  const rows = useMemo(() => stripStops(stops), [stops]);
  const stretch: Stretch | null = useMemo(
    () => (line && screen.kind === 'stretch' ? stretchBetween(line, stops, screen.from, screen.to) : null),
    [line, stops, screen],
  );

  useEffect(() => { onDetailsChange?.(screen.kind === 'details'); }, [screen.kind, onDetailsChange]);
  // Reopen a linked stretch once the line is known.
  useEffect(() => {
    const want = pendingStretch.current;
    if (!want || !line) return;
    pendingStretch.current = null;
    const [a, b] = want.split('~');
    const ia = stops.findIndex(s => s.stopId === a), ib = stops.findIndex(s => s.stopId === b);
    const st = ia >= 0 && ib > ia ? stretchBetween(line, stops, ia, ib) : null;
    if (st) { setScreen({ kind: 'stretch', from: ia, to: ib, row: null }); onZoom(st.bounds); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, stops]);
  useEffect(() => {
    if (!data) return;
    syncUrlParams({
      p: band,
      dir: dir == null ? null : String(directionId),
      stretch: stretch ? `${stretch.from.stopId}~${stretch.to.stopId}` : pendingStretch.current,
      view: screen.kind === 'details' ? 'details' : null,
    });
  }, [data, band, dir, directionId, stretch, screen.kind]);
  useEffect(() => () => syncUrlParams({ dir: null, stretch: null, view: null }), []);
  useEffect(() => { onHighlight(stretch ? stretch.coordinates : null); }, [stretch, onHighlight]);
  useEffect(() => () => onHighlight(null), [onHighlight]);


  const openStretch = (s: Stretch | null, row: number | null) => {
    if (!s) return;
    setScreen({ kind: 'stretch', from: s.from.index, to: s.to.index, row });
    onZoom(s.bounds);
  };

  // A click on the line opens the stretch between the strip rows either side of it.
  useEffect(() => {
    if (!line) { registerMapClick(null); return; }
    registerMapClick((lonLat, toleranceM) => {
      const p = placeOnLine(line, lonLat, Math.max(40, toleranceM));
      if (!p || rows.length < 2) return;
      let i = rows.findIndex(r => r.index > p.segIndex) - 1;
      if (i < 0) i = p.segIndex < rows[0].index ? 0 : rows.length - 2;
      openStretch(stretchForRow(line, stops, rows, i), i);
    });
    return () => registerMapClick(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, rows, stops, registerMapClick]);

  if (!data || !line) return null;
  const totalDays = data.dates.length;
  const range = `${shortDate(data.dates[0])}–${shortDate(data.dates[data.dates.length - 1])}`;
  const bandLabel = SEGMENT_BAND_OPTIONS.find(o => o.id === band)?.label ?? band;
  const still = usableStandingStill(data, band).filter(s => s.stop.directionId === directionId);

  if (screen.kind === 'details') {
    return <Details data={data} line={line} stops={stops} band={band} bandLabel={bandLabel} directionLabel={directions.find(d => d.id === directionId)?.label ?? ''} still={still} range={range} onBack={() => setScreen({ kind: 'card' })} />;
  }

  const pickers = (
    <div className="flex flex-col gap-1.5">
      <Chips options={SEGMENT_BAND_OPTIONS} value={band} onChange={setBand} />
      {directions.length > 1 && <Chips options={directions} value={directionId} onChange={d => { setDir(d); setScreen({ kind: 'card' }); }} />}
    </div>
  );

  if (screen.kind === 'stretch' && stretch) {
    const measured = stretch.stops.filter(s => s.stat);
    const tally = runningTimeTally(stretch.segments, band);
    const ids = new Set(stretch.stops.map(s => s.stopId));
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => { setScreen({ kind: 'card' }); }} className="p-0.5 -ml-0.5 mt-0.5 text-[var(--text-dim)] hover:text-[var(--text-primary)] shrink-0" aria-label="Back to the whole route">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="min-w-0">
            <div className="text-sm font-black text-[var(--text-primary)] leading-tight truncate">{stretch.from.label} to {stretch.to.label}</div>
            <div className="text-xs font-bold text-[var(--text-muted)]">{directions.find(d => d.id === directionId)?.label} · {bandLabel}</div>
          </div>
        </div>
        {pickers}
        <Section title="Gaps at each stop">
          <GapStrip stops={measured} />
        </Section>
        <Section title="Time between stops">
          <Plain text={tally.total ? `${tally.within} of ${tally.total} stop pairs within ½ min of timetable or faster` : 'Not enough trips measured'} />
        </Section>
        <Section title="Stood still 2+ min">
          <StillRows rows={still.filter(s => ids.has(s.stop.stopId))} totalDays={totalDays} />
        </Section>
      </div>
    );
  }

  const summary = sharedSummary(data, line, band);
  const ewt = extraWaitRun(stops);
  const tally = runningTimeTally(line.segments, band);
  const liveBand = livePeriod(data);
  const liveSched = sharedSummary(data, line, liveBand);
  const live = feedDegraded || !recent ? null : liveGaps(data, line, liveBand === band ? stops : withStats(line, liveBand), liveBand, recent, Math.floor(now / 1000));

  return (
    <div className="flex flex-col gap-3">
      {pickers}

      <Section title={`Right now · ${torontoTime(new Date(now))}`}>
        {live && !live.incomplete ? (
          <>
            <Figures items={[`${live.cars} cars on ${line.sharedStreet ?? 'the line'}`, liveSched ? `scheduled every ${schedText(liveSched)}` : live.scheduledSec ? `scheduled every ${mins(live.scheduledSec)}` : null]} />
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-bold tabular-nums">
              <span className="text-[var(--text-dim)]">Gaps, front to back (min)</span>
              {live.gapsMin.map((g, i) => (
                g == null
                  ? <span key={i} className="text-[var(--text-dim)]" title="The car ahead's passing wasn't seen">–</span>
                  : <span key={i} style={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? { color: AMBER } : undefined} className={live.scheduledSec && g * 60 >= 2 * live.scheduledSec ? 'font-black' : 'text-[var(--text-primary)]'}>{g}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs font-bold text-[var(--text-muted)]">{feedDegraded || !recent || live?.incomplete ? 'Live feed incomplete right now' : 'Fewer than 2 cars on the shared section'}</div>
        )}
      </Section>

      <Section title={`${bandLabel} · ${directions.find(d => d.id === directionId)?.label ?? ''}${summary ? ` · ${line.sharedStreet}` : ''}`}>
        {summary && (
          <Stats items={[
            ['Scheduled', `every ${schedText(summary)}`],
            ['Typical gap', `${mins(summary.actualMedianGapSec)} min`],
            ['8 in 10 gaps', `${minsRange(summary.gapP10Sec, summary.gapP90Sec)} min`],
          ]} />
        )}
        {ewt && ewt.peak.stat!.excessWaitSec! >= 30 && (
          <div className="text-xs font-bold text-[var(--text-muted)] tabular-nums">
            Extra wait vs timetable: {ewt.first === ewt.peak || ewt.first.stat!.excessWaitSec! < 30
              ? <>up to {mins(ewt.peak.stat!.excessWaitSec!)} min ({stopLabel(ewt.peak.name)})</>
              : ewt.first.label === ewt.peak.label
                ? <>{mins(ewt.first.stat!.excessWaitSec!)} → {mins(ewt.peak.stat!.excessWaitSec!)} min ({stopLabel(ewt.first.name)} → {stopLabel(ewt.peak.name)})</>
                : <>{mins(ewt.first.stat!.excessWaitSec!)} → {mins(ewt.peak.stat!.excessWaitSec!)} min ({ewt.first.label} → {ewt.peak.label})</>}
          </div>
        )}
      </Section>

      <Section title="Gaps at each stop">
        <GapStrip stops={rows} onRow={i => openStretch(stretchForRow(line, stops, rows, i), i)} />
      </Section>

      <Section title="Stood still 2+ min">
        <StillRows rows={still.slice(0, 3)} totalDays={totalDays} />
      </Section>

      <Section title="Time between stops">
        <Plain text={tally.total ? `${tally.within} of ${tally.total} stop pairs within ½ min of timetable or faster` : 'Not enough trips measured'} />
      </Section>

      <button type="button" onClick={() => setScreen({ kind: 'details' })} className="flex items-center justify-between pt-3 border-t border-[var(--border-primary)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        <span>{totalDays} days, {range}</span>
        <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">Details<ChevronRight className="w-3 h-3" /></span>
      </button>
    </div>
  );
}

function Details({ data, line, stops, band, bandLabel, directionLabel, still, range, onBack }: {
  data: SegmentDelayData; line: LineModel; stops: LineStop[]; band: SegmentBand; bandLabel: string; directionLabel: string;
  still: ReturnType<typeof usableStandingStill>; range: string; onBack: () => void;
}) {
  const totalDays = data.dates.length;
  const measured = stops.filter(s => s.stat);
  const pairs = line.segments.filter(s => {
    const b = s.bands[band];
    return !s.terminal && b && b.trips >= MIN_SEGMENT_TRIPS && b.days >= MIN_DAYS;
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onBack} className="p-0.5 -ml-0.5 mt-0.5 text-[var(--text-dim)] hover:text-[var(--text-primary)] shrink-0" aria-label="Back to the card">
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--text-primary)] leading-tight">Details</div>
          <div className="text-xs font-bold text-[var(--text-muted)]">{directionLabel} · {bandLabel} · {totalDays} days, {range}</div>
        </div>
      </div>

      <Section title="Gaps at every stop">
        {measured.length === 0 ? <div className="text-xs text-[var(--text-muted)]">Not enough gaps measured.</div> : measured.map(s => (
          <div key={s.stopId} className="flex flex-col">
            <span className={ROW_LABEL}>{s.label}</span>
            <span className={DETAIL}>
              Scheduled every {schedText(s.stat!)} · typical {mins(s.stat!.actualMedianGapSec)} · 8 in 10: {minsRange(s.stat!.gapP10Sec, s.stat!.gapP90Sec)} min
              {s.stat!.excessWaitSec != null && <> · extra wait {mins(s.stat!.excessWaitSec)} min</>} · {s.stat!.gaps} gaps, {s.stat!.days} days
            </span>
          </div>
        ))}
      </Section>

      <Section title="Time between stops vs timetable">
        {pairs.map(s => {
          const b = s.bands[band]!;
          const p90 = halfMinutesDown(b.gainedP90Sec);
          return (
            <div key={`${s.fromStopId}>${s.toStopId}`} className="flex flex-col">
              <span className={ROW_LABEL}>{stopLabel(s.fromName)} to {stopLabel(s.toName)}</span>
              <span className={DETAIL}>
                Typical {b.gainedMedianSec >= 0 ? '+' : ''}{mins(b.gainedMedianSec)} min vs timetable
                {p90 > halfMinutes(b.gainedMedianSec) && p90 > 0 && <> · 1 in 10 take {p90}+ min longer</>} · {b.trips} trips, {b.days} days
              </span>
            </div>
          );
        })}
      </Section>

      <Section title="Stood still 2+ min near a stop">
        <StillRows rows={still} totalDays={totalDays} />
      </Section>

      <Section title="How this is measured">
        <ul className="list-disc pl-4 text-xs text-[var(--text-muted)] leading-snug flex flex-col gap-1">
          <li>Vehicle positions recorded about once a minute, {totalDays} days ({range}; last day partial). Each stop's passing time is interpolated between positions.</li>
          <li>Gaps are measured only where every scheduled trip in a row was seen at the stop, so a missing car never shows as one long gap. Trips not seen are left out, so real waits can be longer.</li>
          <li>"8 in 10 gaps" is the 10th to 90th percentile of actual gaps, widened to the next ½ min at each end; for the shared section, every gap at its stops is pooled. Typical is the median. A scheduled range means the timetable mixes headways in that period. Extra wait is the average wait for a rider arriving at random, minus the same for the timetable.</li>
          <li>Time between stops compares every car's time for each stop pair with the timetable for that time of day. Line ends and the stop next to them are left out (layover and loop time).</li>
          <li>Stood still: moved 25 m or less for 2+ min within 60 m of a stop. Could be holding for time, a signal or a blockage; the data can't tell which. Terminals, turn-back points and carhouses are left out; a stop needs 10 times on 5 days.</li>
          <li>Right now: from the last 30 min of recorded positions, a gap is how long ago the car ahead passed the spot where the car behind is now. "–" means that passing wasn't seen. Cars on trips the timetable doesn't list (e.g. added buses) count once their own track shows which way they're going; ones that haven't moved 200 m in 10 min are treated as parked. Hidden when the feed is behind, a moving car's direction can't be told, or fewer than half the scheduled cars are reporting.</li>
          <li>Values are rounded to the nearest ½ min; stops with fewer than 30 gaps or 5 days are left out.</li>
        </ul>
      </Section>
    </div>
  );
}
