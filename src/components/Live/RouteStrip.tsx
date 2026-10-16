import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import DataTable from '../ui/DataTable';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  LEGEND_TITLE, MIN_N, delayText, legendSteps, stepLabel, keyStops, labelLines, labelWidth, pct, pickLabels, shortStopName, stepColor, stepFor, stopDetail, stopStep, stopN, stopValue, stretchSpan, stripSummary,
  type RouteStripMode, type RouteStripStop, type RouteStripStretch, type Step, type StretchSpan,
} from './routeStripModel';

export type { RouteStripMode, RouteStripStop, RouteStripStretch } from './routeStripModel';
export { routeStripFromV3 } from './routeStripModel';

export interface RouteStripProps {
  /** The direction's stops in route order. */
  stops: readonly RouteStripStop[];
  /** The tracks to draw, top to bottom, on the same stop positions. Default: delay, then bunching. */
  modes?: readonly RouteStripMode[];
  /** "Southbound": used in the screen-reader summary and the table caption. */
  directionLabel: string;
  /** Where delay starts to build up (marked on the delay track). */
  delaysStart?: RouteStripStretch | null;
  /** Where bunching forms (marked on the bunching track). */
  bunchingForms?: RouteStripStretch | null;
  /** Stops measured fewer times than this are faded. Default 30. */
  minN?: number;
  /** The strip becomes a vertical list on phones (screens under 480px wide), or when its own column is narrower than this (px). Default 360. */
  verticalBelow?: number;
  className?: string;
  /** A stop the parent has picked (by position): drawn marked, and kept when the pointer leaves. Optional: without it the strip only shows hover. */
  selected?: number | null;
  /** Called with the stop's position when a stop is clicked, tapped, or chosen with Enter. */
  onSelect?: (index: number) => void;
  /** The track whose marked stretch is picked, drawn marked. */
  selectedStretch?: RouteStripMode | null;
  /** Called when a marked stretch's bracket is clicked. */
  onSelectStretch?: (mode: RouteStripMode) => void;
}

const INSET = 10;
const GUTTER = 72;
const MARK_H = 26;
const LINE_H = 24;
const TRACK_NAME: Record<RouteStripMode, string> = { delay: 'Delay', bunching: 'Bunching' };

/** Measures the element's width, so the layout follows the column it sits in, not the window. */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width || el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function swatchStyle(mode: RouteStripMode, step: Step | null, uncertain: boolean): CSSProperties {
  if (step == null) return { background: 'transparent', border: '1.5px dashed var(--text-dim)' };
  const c = stepColor(mode, step);
  if (uncertain) return { background: `repeating-linear-gradient(135deg, ${c} 0 1.5px, transparent 1.5px 3.5px)`, border: `1.5px solid ${c}` };
  return { background: c, boxShadow: '0 0 0 1px var(--strip-ring)' };
}

function Swatch({ mode, step, uncertain = false, faded = false }: { mode: RouteStripMode; step: Step | null; uncertain?: boolean; faded?: boolean }) {
  return <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ ...swatchStyle(mode, step, uncertain), opacity: faded ? 0.35 : 1 }} />;
}

function valueText(stop: RouteStripStop, mode: RouteStripMode): string {
  const v = stopValue(stop, mode);
  if (v == null) return 'not measured';
  return mode === 'delay' ? delayText(v) : `${pct(v)} of gaps off`;
}

/** One track's colours and marked stretch. */
interface Track {
  mode: RouteStripMode;
  steps: (Step | null)[];
  stretch: StretchSpan | null;
  faded: (s: RouteStripStop) => boolean;
}

/**
 * One direction of a route as lines of stops on the same positions: a delay track and a bunching track, each coloured
 * by its own three-step scale and with its own marked stretch ("Delays start", "Bunching forms"), sharing one row of
 * stop names. Wide: horizontal lines with the terminals, the marked stretches' ends and a few evenly spaced stops named.
 * On phones, or in a column narrower than `verticalBelow` px: a compact vertical line per track with the key stops
 * named, and a "Show all stops" switch for the full list. The strip is one focusable unit: its label sums it up, the
 * arrow keys step through the stops, and the same figures are in a table for screen readers.
 */
export default function RouteStrip({ stops, modes = ['delay', 'bunching'], directionLabel, delaysStart, bunchingForms, minN = MIN_N, verticalBelow = 360, className = '', selected = null, onSelect, selectedStretch = null, onSelectStretch }: RouteStripProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [allStops, setAllStops] = useState(false);
  const liveId = useId();
  const tableId = useId();
  const tracks: Track[] = useMemo(() => modes.map(mode => ({
    mode,
    steps: stops.map(s => stopStep(s, mode)),
    stretch: mode === 'delay' ? stretchSpan(stops, delaysStart, 'delaysStart') : stretchSpan(stops, bunchingForms, 'bunchingForms'),
    faded: (s: RouteStripStop) => stopN(s, mode) > 0 && stopN(s, mode) < minN,
  })), [modes, stops, delaysStart, bunchingForms, minN]);
  const summary = useMemo(() => tracks.map((t, k) => {
    const text = stripSummary(stops, t.mode, directionLabel, t.stretch);
    return k < tracks.length - 1 ? text.replace(/ Use the left and right arrow keys to hear each stop\.$/, '') : text;
  }).join(' '), [tracks, stops, directionLabel]);
  const phone = useMediaQuery('(max-width: 479px)');
  const vertical = phone || (width > 0 && width < verticalBelow);
  const count = stops.length;
  const anyUncertain = stops.some(s => s.uncertain);
  const anyFaded = tracks.some(t => stops.some(t.faded));
  const anyMissing = tracks.some(t => t.steps.some(s => s == null));

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const next = (i: number) => { e.preventDefault(); setActive(Math.max(0, Math.min(count - 1, i))); };
    const prevKey = vertical ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = vertical ? 'ArrowDown' : 'ArrowRight';
    if (e.key === nextKey || (vertical && e.key === 'ArrowRight') || (!vertical && e.key === 'ArrowDown')) next(active == null ? 0 : active + 1);
    else if (e.key === prevKey || (vertical && e.key === 'ArrowLeft') || (!vertical && e.key === 'ArrowUp')) next(active == null ? count - 1 : active - 1);
    else if (e.key === 'Home') next(0);
    else if (e.key === 'End') next(count - 1);
    else if (e.key === 'Escape') setActive(null);
    else if ((e.key === 'Enter' || e.key === ' ') && active != null && onSelect) { e.preventDefault(); onSelect(active); }
  }, [active, count, vertical, onSelect]);
  // Vertical lists only call this on a click or tap, so it is where a pick is reported.
  const pickStop = useCallback((i: number | null) => { setActive(i); if (i != null) onSelect?.(i); }, [onSelect]);

  const activeStop = active != null ? stops[active] : null;
  const announce = activeStop ? `${activeStop.name}. ${stopDetail(activeStop).lines.join('. ')}.` : '';

  // Horizontal geometry: track names sit in a left gutter, the stops share one set of x positions.
  const plotW = Math.max(0, width - GUTTER);
  const inner = Math.max(0, plotW - INSET * 2);
  const xs = useMemo(() => stops.map((_, i) => GUTTER + INSET + (count > 1 ? (i * inner) / (count - 1) : inner / 2)), [stops, count, inner]);
  const spacing = count > 1 ? inner / (count - 1) : inner;
  const dot = Math.max(6, Math.min(12, Math.floor(spacing - 3)));
  const labelText = useMemo(() => stops.map(s => shortStopName(s.name)), [stops]);
  const priority = useMemo(() => tracks.flatMap(t => (t.stretch ? [t.stretch.from, t.stretch.to] : [])), [tracks]);
  const labels = useMemo(() => {
    if (vertical || width === 0) return [];
    const majors = Math.max(3, Math.min(6, Math.floor(plotW / 150)));
    return pickLabels({ xs: xs.map(x => x - GUTTER), widths: labelText.map(t => labelWidth(t)), width: plotW, priority, majors });
  }, [vertical, width, plotW, xs, labelText, priority]);

  // Labels wrap to show the full name, so the label row grows with the longest one shown.
  const LABEL_LINE = 16;
  const labelRows = Math.max(1, ...labels.map(i => labelLines(labelText[i])));
  const trackTop = (k: number) => k * (MARK_H + LINE_H);
  const lineY = (k: number) => trackTop(k) + MARK_H + LINE_H / 2;
  const labelsTop = tracks.length * (MARK_H + LINE_H);

  const pickAt = (e: PointerEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((x - GUTTER - INSET) / (inner || 1)) * (count - 1));
    const at = Math.max(0, Math.min(count - 1, i));
    setActive(at);
    if (e.type === 'pointerdown') onSelect?.(at);
  };

  const legend = (
    // One line that wraps only where it runs out of room (phones): each key stays together.
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--text-legend)]">
      {tracks.map(t => (
        <span key={t.mode} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="font-bold text-[var(--text-secondary)]">{LEGEND_TITLE[t.mode]}:</span>
          {legendSteps(t.mode).map(step => (
            <span key={step} className="inline-flex items-center gap-1"><Swatch mode={t.mode} step={step} />{stepLabel(t.mode, step)}</span>
          ))}
        </span>
      ))}
      {anyUncertain && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={1} uncertain />Less exact</span>}
      {anyFaded && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={1} faded />Fewer than {minN} departures or gaps</span>}
      {anyMissing && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={null} />Not measured</span>}
    </div>
  );

  const table = (
    <div id={tableId} className="sr-only">
        <DataTable
          caption={`${directionLabel}: delay and bunching at each stop`}
          rows={stops.map((s, i) => ({ s, i }))}
          rowKey={r => `${r.s.stopId}-${r.i}`}
          columns={[
            { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: r => r.s.name },
            { key: 'delay', header: 'Typical delay', cell: r => (r.s.delayMin != null && r.s.n > 0 ? delayText(r.s.delayMin) : 'not measured') },
            { key: 'late', header: 'Late', cell: r => (r.s.lateShare != null && r.s.n > 0 ? pct(r.s.lateShare) : '') },
            { key: 'bunch', header: 'Gaps off', cell: r => (r.s.bunchingShare != null && (r.s.bunchingN ?? r.s.n) > 0 ? pct(r.s.bunchingShare) : 'not measured') },
            { key: 'n', header: 'Departures', cell: r => r.s.n.toLocaleString() },
            { key: 'note', header: 'Note', cell: r => [r.s.uncertain ? 'less exact' : '', r.s.n < minN ? 'few departures' : ''].filter(Boolean).join(', ') },
          ]}
        />
    </div>
  );

  return (
    <figure className={`m-0 min-w-0 ${className}`.trim()}>
      <div
        ref={ref}
        role="group"
        aria-roledescription="route strip"
        aria-label={summary}
        aria-describedby={tableId}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActive(null); }}
        className="relative rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span id={liveId} className="sr-only" aria-live="polite">{announce}</span>
        {vertical ? (
          allStops
            ? <VerticalList stops={stops} tracks={tracks} active={active ?? selected} setActive={pickStop} />
            : <CompactList stops={stops} tracks={tracks} active={active ?? selected} setActive={pickStop} showDetail={!onSelect} />
        ) : width > 0 && count > 0 ? (
          <div
            className="relative touch-pan-y select-none"
            style={{ height: labelsTop + 4 + labelRows * LABEL_LINE }}
            onPointerMove={e => { if (e.pointerType === 'mouse') pickAt(e); }}
            onPointerDown={pickAt}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
            aria-hidden="true"
          >
            {active != null && <div className="pointer-events-none absolute rounded-md bg-[var(--bg-btn-hover)] opacity-60" style={{ left: xs[active] - Math.max(8, spacing / 2), width: Math.max(16, spacing), top: MARK_H - 4, height: labelsTop - MARK_H + 8 }} />}
            {selected != null && xs[selected] != null && <div className="pointer-events-none absolute rounded-md bg-[var(--accent-selected-bg)]" style={{ left: xs[selected] - Math.max(8, spacing / 2), width: Math.max(16, spacing), top: MARK_H - 4, height: labelsTop - MARK_H + 8 }} />}
            {tracks.map((t, k) => (
              <Fragment key={t.mode}>
                <span className="absolute left-0 text-xs font-bold text-[var(--text-secondary)]" style={{ top: lineY(k) - 8, width: GUTTER - 8 }}>{TRACK_NAME[t.mode]}</span>
                {t.stretch && (
                  <div
                    className={`absolute ${onSelectStretch ? 'cursor-pointer' : 'pointer-events-none'}`}
                    style={{ left: xs[t.stretch.from] - 7, width: xs[t.stretch.to] - xs[t.stretch.from] + 14, top: trackTop(k) + 4, height: MARK_H - 4 }}
                    onPointerDown={onSelectStretch ? e => { e.stopPropagation(); onSelectStretch(t.mode); } : undefined}
                  >
                    <div className={`absolute inset-x-0 bottom-0 h-2 rounded-t-sm border-x-2 border-t-2 ${selectedStretch === t.mode ? 'border-[var(--accent)]' : 'border-[var(--text-secondary)]'}`} />
                    <span
                      className="absolute bottom-3 whitespace-nowrap text-xs font-bold text-[var(--text-primary)]"
                      style={xs[t.stretch.from] < GUTTER + plotW / 2 ? { left: 0 } : { right: 0 }}
                    >{labels.includes(t.stretch.from) && labels.includes(t.stretch.to) ? t.stretch.label : `${t.stretch.label}: ${labelText[t.stretch.from]} to ${labelText[t.stretch.to]}`}</span>
                  </div>
                )}
                <div className="absolute rounded-full bg-[var(--text-dim)] opacity-40" style={{ left: GUTTER + INSET, right: INSET, top: lineY(k) - 1, height: 2 }} />
                {stops.map((s, i) => (
                  <span
                    key={`${s.stopId}-${i}`}
                    className="absolute rounded-full transition-transform"
                    style={{
                      ...swatchStyle(t.mode, t.steps[i], !!s.uncertain),
                      width: dot, height: dot, left: xs[i] - dot / 2, top: lineY(k) - dot / 2,
                      opacity: t.faded(s) ? 0.35 : 1,
                      transform: active === i ? 'scale(1.45)' : undefined,
                      outline: active === i ? '2px solid var(--text-primary)' : undefined,
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </Fragment>
            ))}
            {labels.map(i => {
              const w = labelWidth(labelText[i]);
              const left = i === 0 ? GUTTER : i === count - 1 ? width - w : Math.max(GUTTER, Math.min(width - w, xs[i] - w / 2));
              const end = tracks.some(t => t.stretch && (i === t.stretch.from || i === t.stretch.to));
              return (
                <span
                  key={i}
                  className={`absolute whitespace-normal break-words text-xs leading-4 ${end ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-dim)]'} ${i === 0 ? 'text-left' : i === count - 1 ? 'text-right' : 'text-center'}`}
                  style={{ left, width: w, top: labelsTop }}
                >{labelText[i]}</span>
              );
            })}
            {activeStop && active != null && <Tooltip stop={activeStop} x={xs[active]} width={width} top={labelsTop + 6 + labelRows * LABEL_LINE} />}
          </div>
        ) : null}
      </div>
      {vertical && count > 2 && (
        <button type="button" onClick={() => setAllStops(v => !v)} aria-expanded={allStops} className="mt-2 text-xs font-bold text-[var(--accent)]">
          {allStops ? 'Show key stops only' : `Show all ${count} stops`}
        </button>
      )}
      {legend}
      {table}
    </figure>
  );
}

function Tooltip({ stop, x, width, top }: { stop: RouteStripStop; x: number; width: number; top: number }) {
  const w = Math.min(260, width);
  const left = Math.max(0, Math.min(width - w, x - w / 2));
  const d = stopDetail(stop);
  return (
    <div className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-2 text-xs shadow-sm" style={{ left, top, width: w }}>
      <div className="font-bold text-[var(--text-primary)]">{d.name}</div>
      {d.lines.map(l => <div key={l} className="mt-0.5 text-[var(--text-secondary)]">{l}</div>)}
    </div>
  );
}

/** Columns of dots for the vertical layouts: one per track, side by side, each on its own line. */
const COL_X = [16, 70];
const NAME_LEFT = 94;

function TrackDots({ tracks, s, i, last, size, active, centred }: { tracks: readonly Track[]; s: RouteStripStop; i: number; last: number; size: number; active: boolean; centred: string }) {
  return (
    <>
      {tracks.map((t, k) => {
        const inStretch = t.stretch != null && i >= t.stretch.from && i <= t.stretch.to;
        const bx = COL_X[k] + (k === 0 ? -10 : 10);
        return (
          <Fragment key={t.mode}>
            <span className="pointer-events-none absolute w-0.5 bg-[var(--text-dim)] opacity-40" style={{ left: COL_X[k] - 1, top: i === 0 ? centred : 0, bottom: i === last ? `calc(100% - ${centred})` : 0 }} />
            {inStretch && <span className="pointer-events-none absolute w-0.5 bg-[var(--text-secondary)]" style={{ left: bx, top: i === t.stretch!.from ? centred : 0, bottom: i === t.stretch!.to ? `calc(100% - ${centred})` : 0 }} />}
            {inStretch && (i === t.stretch!.from || i === t.stretch!.to) && <span className="pointer-events-none absolute h-0.5 w-1.5 bg-[var(--text-secondary)]" style={{ left: k === 0 ? bx : bx - 5, top: centred }} />}
            <span
              className="absolute rounded-full"
              style={{ ...swatchStyle(t.mode, t.steps[i], !!s.uncertain), width: size, height: size, left: COL_X[k] - size / 2, top: `calc(${centred} - ${size / 2}px)`, opacity: t.faded(s) ? 0.35 : 1, outline: active ? '2px solid var(--text-primary)' : undefined, outlineOffset: 2 }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

function TrackHeads({ tracks }: { tracks: readonly Track[] }) {
  return (
    <div className="relative h-5 text-xs font-bold text-[var(--text-secondary)]" aria-hidden="true">
      {tracks.map((t, k) => <span key={t.mode} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: COL_X[k] }}>{TRACK_NAME[t.mode]}</span>)}
    </div>
  );
}

/** Where a track's marked stretch starts, as text beside that row. */
const stretchNote = (tracks: readonly Track[], i: number) => tracks.filter(t => t.stretch && i === t.stretch.from).map(t => t.stretch!.label).join(', ');

function VerticalList({ stops, tracks, active, setActive }: {
  stops: readonly RouteStripStop[];
  tracks: readonly Track[];
  active: number | null;
  setActive: (i: number | null) => void;
}) {
  const last = stops.length - 1;
  return (
    <div aria-hidden="true">
      <TrackHeads tracks={tracks} />
      <ol className="m-0 list-none p-0">
        {stops.map((s, i) => {
          const isActive = active === i;
          const marked = tracks.some(t => t.stretch && i >= t.stretch.from && i <= t.stretch.to);
          const note = stretchNote(tracks, i);
          return (
            <li key={`${s.stopId}-${i}`} className="relative">
              <TrackDots tracks={tracks} s={s} i={i} last={last} size={11} active={isActive} centred="15px" />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setActive(isActive ? null : i)}
                className={`relative flex w-full items-start gap-2 rounded-md py-1 pr-1 text-left ${isActive ? 'bg-[var(--bg-hover)]' : ''}`}
                style={{ paddingLeft: NAME_LEFT }}
              >
                <span className="min-w-0 flex-1">
                  {note && <span className="block text-xs font-bold leading-5 text-[var(--text-primary)]">{note}</span>}
                  <span className={`block text-sm leading-5 ${i === 0 || i === last || marked ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{s.name}</span>
                  {isActive && stopDetail(s).lines.map(l => <span key={l} className="block text-xs leading-5 text-[var(--text-muted)]">{l}</span>)}
                </span>
                <span className="shrink-0 text-right text-xs leading-5 text-[var(--text-secondary)]">
                  {tracks.map(t => <span key={t.mode} className={`block ${t.faded(s) ? 'text-[var(--text-dim)]' : ''}`}>{valueText(s, t.mode)}</span>)}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const ROW_DOT = 6;
const ROW_NAMED = 22;

/**
 * Phones: a vertical line per track, side by side, with only the key stops named (both ends, the marked stretches, a
 * few stations); the stops between are small unnamed dots. Tap anywhere on the lines to pick the nearest stop.
 */
function CompactList({ stops, tracks, active, setActive, showDetail = true }: {
  stops: readonly RouteStripStop[];
  tracks: readonly Track[];
  active: number | null;
  setActive: (i: number | null) => void;
  /** Off when the parent shows the picked stop's figures itself. */
  showDetail?: boolean;
}) {
  const named = useMemo(() => {
    const keep = new Set<number>();
    for (const t of tracks) for (const i of keyStops(stops, t.stretch)) keep.add(i);
    return keep;
  }, [stops, tracks]);
  const last = stops.length - 1;
  const height = (i: number) => (named.has(i) ? ROW_NAMED : ROW_DOT);
  // A tap picks the stop whose row centre is nearest (rows with long names wrap, so measure them).
  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const y = e.clientY;
    const rows = [...e.currentTarget.children].map(el => el.getBoundingClientRect());
    let best = 0;
    rows.forEach((r, i) => { if (Math.abs(r.top + r.height / 2 - y) < Math.abs(rows[best].top + rows[best].height / 2 - y)) best = i; });
    setActive(active === best ? null : best);
  };
  const activeStop = active != null ? stops[active] : null;
  return (
    <div aria-hidden="true">
      <TrackHeads tracks={tracks} />
      <div className="relative touch-pan-y select-none" onPointerDown={pick}>
        {stops.map((s, i) => {
          const isNamed = named.has(i);
          const marked = tracks.some(t => t.stretch && i >= t.stretch.from && i <= t.stretch.to);
          const note = stretchNote(tracks, i);
          return (
            <div key={`${s.stopId}-${i}`} className="relative flex items-center" style={{ minHeight: height(i) }}>
              <TrackDots tracks={tracks} s={s} i={i} last={last} size={isNamed ? 10 : 5} active={active === i} centred="50%" />
              {isNamed && (
                <span className="flex min-w-0 flex-1 items-baseline gap-2" style={{ marginLeft: NAME_LEFT }}>
                  <span className={`min-w-0 flex-1 break-words py-0.5 text-sm leading-5 ${i === 0 || i === last || marked ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{shortStopName(s.name)}</span>
                </span>
              )}
              {note && <span className="pointer-events-none absolute right-0 text-xs font-bold text-[var(--text-primary)]" style={{ top: isNamed ? -14 : -10 }}>{note}</span>}
            </div>
          );
        })}
      </div>
      {showDetail && activeStop && (
        <div className="mt-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-2 text-xs">
          <div className="font-bold text-[var(--text-primary)]">{stopDetail(activeStop).name}</div>
          {stopDetail(activeStop).lines.map(l => <div key={l} className="mt-0.5 text-[var(--text-secondary)]">{l}</div>)}
        </div>
      )}
    </div>
  );
}
