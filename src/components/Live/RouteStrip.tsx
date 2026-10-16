import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import DataTable from '../ui/DataTable';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  LEGEND_TITLE, MIN_N, STEP_LABELS, delayText, keyStops, labelLines, labelWidth, pct, pickLabels, shortStopName, stepColor, stepFor, stopDetail, stopN, stopValue, stretchSpan, stripSummary,
  type RouteStripMode, type RouteStripStop, type RouteStripStretch, type Step, type StretchSpan,
} from './routeStripModel';

export type { RouteStripMode, RouteStripStop, RouteStripStretch } from './routeStripModel';
export { routeStripFromV3 } from './routeStripModel';

export interface RouteStripProps {
  /** The direction's stops in route order. */
  stops: readonly RouteStripStop[];
  /** What the colours show: typical delay, or the share of gaps too short or too long. */
  mode: RouteStripMode;
  /** "Southbound": used in the screen-reader summary and the table caption. */
  directionLabel: string;
  /** Where delay starts to build up (shown in delay mode). */
  delaysStart?: RouteStripStretch | null;
  /** Where bunching forms (shown in bunching mode). */
  bunchingForms?: RouteStripStretch | null;
  /** Stops measured fewer times than this are faded. Default 30. */
  minN?: number;
  /** The strip becomes a vertical list on phones (screens under 480px wide), or when its own column is narrower than this (px). Default 360. */
  verticalBelow?: number;
  className?: string;
}

const INSET = 10;
const MARK_H = 26;
const LINE_H = 28;

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

/**
 * One direction of a route as a line of stops, each coloured by a three-step scale for typical delay or for bunching.
 * Wide: a horizontal line with the terminals, the marked stretch's ends and a few evenly spaced stops labelled.
 * On phones, or in a column narrower than `verticalBelow` px: a compact vertical line with the key stops named, and a
 * "Show all stops" switch for the full list with every stop named. The strip is one focusable unit: its label
 * sums it up, the arrow keys step through the stops, and the same figures are available as a table.
 */
export default function RouteStrip({ stops, mode, directionLabel, delaysStart, bunchingForms, minN = MIN_N, verticalBelow = 360, className = '' }: RouteStripProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [allStops, setAllStops] = useState(false);
  const liveId = useId();
  const tableId = useId();
  const stretch: StretchSpan | null = useMemo(
    () => (mode === 'delay' ? stretchSpan(stops, delaysStart, 'delaysStart') : stretchSpan(stops, bunchingForms, 'bunchingForms')),
    [mode, stops, delaysStart, bunchingForms],
  );
  const summary = useMemo(() => stripSummary(stops, mode, directionLabel, stretch), [stops, mode, directionLabel, stretch]);
  const phone = useMediaQuery('(max-width: 479px)');
  const vertical = phone || (width > 0 && width < verticalBelow);
  const count = stops.length;

  const steps = useMemo(() => stops.map(s => stepFor(mode, stopValue(s, mode))), [stops, mode]);
  const faded = (s: RouteStripStop) => stopN(s, mode) > 0 && stopN(s, mode) < minN;
  const anyUncertain = stops.some(s => s.uncertain);
  const anyFaded = stops.some(faded);
  const anyMissing = steps.some(s => s == null);

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
  }, [active, count, vertical]);

  const activeStop = active != null ? stops[active] : null;
  const announce = activeStop ? `${activeStop.name}. ${stopDetail(activeStop).lines.join('. ')}.` : '';

  // Horizontal geometry.
  const inner = Math.max(0, width - INSET * 2);
  const xs = useMemo(() => stops.map((_, i) => INSET + (count > 1 ? (i * inner) / (count - 1) : inner / 2)), [stops, count, inner]);
  const spacing = count > 1 ? inner / (count - 1) : inner;
  const dot = Math.max(6, Math.min(12, Math.floor(spacing - 3)));
  const labelText = useMemo(() => stops.map(s => shortStopName(s.name)), [stops]);
  const labels = useMemo(() => {
    if (vertical || width === 0) return [];
    const majors = Math.max(3, Math.min(6, Math.floor(width / 150)));
    return pickLabels({ xs, widths: labelText.map(t => labelWidth(t)), width, priority: stretch ? [stretch.from, stretch.to] : [], majors });
  }, [vertical, width, xs, labelText, stretch]);

  // Labels wrap to show the full name, so the label row grows with the longest one shown.
  const LABEL_LINE = 16;
  const labelRows = Math.max(1, ...labels.map(i => labelLines(labelText[i])));

  const pickAt = (e: PointerEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = Math.round(((x - INSET) / (inner || 1)) * (count - 1));
    setActive(Math.max(0, Math.min(count - 1, i)));
  };

  const legend = (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-legend)]">
      <span className="font-bold text-[var(--text-secondary)]">{LEGEND_TITLE[mode]}:</span>
      {([0, 1, 2] as const).map(step => (
        <span key={step} className="inline-flex items-center gap-1.5"><Swatch mode={mode} step={step} />{STEP_LABELS[mode][step]}</span>
      ))}
      {anyUncertain && <span className="inline-flex items-center gap-1.5"><Swatch mode={mode} step={1} uncertain />Less exact</span>}
      {anyFaded && <span className="inline-flex items-center gap-1.5"><Swatch mode={mode} step={1} faded />Fewer than {minN} {mode === 'delay' ? 'departures' : 'gaps'}</span>}
      {anyMissing && <span className="inline-flex items-center gap-1.5"><Swatch mode={mode} step={null} />Not measured</span>}
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
            ? <VerticalList stops={stops} mode={mode} steps={steps} stretch={stretch} active={active} setActive={setActive} faded={faded} />
            : <CompactList stops={stops} mode={mode} steps={steps} stretch={stretch} active={active} setActive={setActive} faded={faded} />
        ) : width > 0 && count > 0 ? (
          <div
            className="relative touch-pan-y select-none"
            style={{ height: MARK_H + LINE_H + 4 + labelRows * LABEL_LINE }}
            onPointerMove={e => { if (e.pointerType === 'mouse') pickAt(e); }}
            onPointerDown={pickAt}
            onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
            aria-hidden="true"
          >
            {stretch && (
              <div className="pointer-events-none absolute" style={{ left: xs[stretch.from] - 7, width: xs[stretch.to] - xs[stretch.from] + 14, top: 4, height: MARK_H - 4 }}>
                <div className="absolute inset-x-0 bottom-0 h-2 rounded-t-sm border-x-2 border-t-2 border-[var(--text-secondary)]" />
                <span
                  className="absolute bottom-3 whitespace-nowrap text-xs font-bold text-[var(--text-primary)]"
                  style={xs[stretch.from] < width / 2 ? { left: 0 } : { right: 0 }}
                >{labels.includes(stretch.from) && labels.includes(stretch.to) ? stretch.label : `${stretch.label}: ${labelText[stretch.from]} to ${labelText[stretch.to]}`}</span>
              </div>
            )}
            <div className="absolute rounded-full bg-[var(--text-dim)] opacity-40" style={{ left: INSET, right: INSET, top: MARK_H + LINE_H / 2 - 1, height: 2 }} />
            {stops.map((s, i) => (
              <span
                key={`${s.stopId}-${i}`}
                className="absolute rounded-full transition-transform"
                style={{
                  ...swatchStyle(mode, steps[i], !!s.uncertain),
                  width: dot, height: dot, left: xs[i] - dot / 2, top: MARK_H + LINE_H / 2 - dot / 2,
                  opacity: faded(s) ? 0.35 : 1,
                  transform: active === i ? 'scale(1.45)' : undefined,
                  outline: active === i ? '2px solid var(--text-primary)' : undefined,
                  outlineOffset: 2,
                }}
              />
            ))}
            {labels.map(i => {
              const w = labelWidth(labelText[i]);
              const left = i === 0 ? 0 : i === count - 1 ? width - w : Math.max(0, Math.min(width - w, xs[i] - w / 2));
              const end = stretch && (i === stretch.from || i === stretch.to);
              return (
                <span
                  key={i}
                  className={`absolute whitespace-normal break-words text-xs leading-4 ${end ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-dim)]'} ${i === 0 ? 'text-left' : i === count - 1 ? 'text-right' : 'text-center'}`}
                  style={{ left, width: w, top: MARK_H + LINE_H }}
                >{labelText[i]}</span>
              );
            })}
            {activeStop && active != null && <Tooltip stop={activeStop} x={xs[active]} width={width} top={MARK_H + LINE_H + 6 + labelRows * LABEL_LINE} />}
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

function VerticalList({ stops, mode, steps, stretch, active, setActive, faded }: {
  stops: readonly RouteStripStop[];
  mode: RouteStripMode;
  steps: readonly (Step | null)[];
  stretch: StretchSpan | null;
  active: number | null;
  setActive: (i: number | null) => void;
  faded: (s: RouteStripStop) => boolean;
}) {
  const last = stops.length - 1;
  return (
    <ol className="m-0 list-none p-0" aria-hidden="true">
      {stops.map((s, i) => {
        const inStretch = stretch != null && i >= stretch.from && i <= stretch.to;
        const isActive = active === i;
        return (
          <Fragment key={`${s.stopId}-${i}`}>
            {stretch && i === stretch.from && (
              <li className="relative pl-11 pt-1 text-xs font-bold leading-5 text-[var(--text-primary)]">
                {i > 0 && <span className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-[var(--text-dim)] opacity-40" />}
                <span className="absolute left-0 top-[14px] h-0.5 w-3 bg-[var(--text-secondary)]" />
                <span className="absolute left-0 top-[14px] bottom-0 w-0.5 bg-[var(--text-secondary)]" />
                {stretch.label}
              </li>
            )}
            <li className="relative">
              {/* The route line and the marked stretch's bracket run the full height of the row, so they never break. */}
              <span className="pointer-events-none absolute left-[19px] w-0.5 bg-[var(--text-dim)] opacity-40" style={{ top: i === 0 ? 15 : 0, bottom: i === last ? 'calc(100% - 15px)' : 0 }} />
              {inStretch && <span className="pointer-events-none absolute left-0 w-0.5 bg-[var(--text-secondary)]" style={{ top: 0, bottom: i === stretch!.to ? 'calc(100% - 15px)' : 0 }} />}
              {inStretch && i === stretch!.to && <span className="pointer-events-none absolute left-0 top-[14px] h-0.5 w-3 bg-[var(--text-secondary)]" />}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setActive(isActive ? null : i)}
                className={`relative flex w-full items-start gap-3 rounded-md py-1 pr-1 text-left ${isActive ? 'bg-[var(--bg-hover)]' : ''}`}
              >
                <span className="relative w-8 shrink-0 self-stretch">
                  <span className="absolute left-[14px] top-[5px] h-3 w-3 rounded-full" style={{ ...swatchStyle(mode, steps[i], !!s.uncertain), opacity: faded(s) ? 0.35 : 1, outline: isActive ? '2px solid var(--text-primary)' : undefined, outlineOffset: 2 }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm leading-5 ${i === 0 || i === last || inStretch ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{s.name}</span>
                  {isActive && stopDetail(s).lines.map(l => <span key={l} className="block text-xs leading-5 text-[var(--text-muted)]">{l}</span>)}
                </span>
                <span className={`shrink-0 text-xs leading-5 ${faded(s) ? 'text-[var(--text-dim)]' : 'text-[var(--text-secondary)]'}`}>{valueText(s, mode)}{s.uncertain ? ', less exact' : ''}</span>
              </button>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

const ROW_DOT = 6;
const ROW_NAMED = 22;

/**
 * Phones: one vertical line with only the key stops named (both ends, the marked stretch, a few stations); the stops
 * between are small unnamed dots. Tap anywhere on the line to pick the nearest stop and read its figures.
 */
function CompactList({ stops, mode, steps, stretch, active, setActive, faded }: {
  stops: readonly RouteStripStop[];
  mode: RouteStripMode;
  steps: readonly (Step | null)[];
  stretch: StretchSpan | null;
  active: number | null;
  setActive: (i: number | null) => void;
  faded: (s: RouteStripStop) => boolean;
}) {
  const named = useMemo(() => new Set(keyStops(stops, stretch)), [stops, stretch]);
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
      <div className="relative touch-pan-y select-none" onPointerDown={pick}>
        {stops.map((s, i) => {
          const isNamed = named.has(i);
          const inStretch = stretch != null && i >= stretch.from && i <= stretch.to;
          const dot = isNamed ? 11 : 5;
          return (
            <div key={`${s.stopId}-${i}`} className="relative flex items-center" style={{ minHeight: height(i) }}>
              <span className="pointer-events-none absolute left-[19px] w-0.5 bg-[var(--text-dim)] opacity-40" style={{ top: i === 0 ? '50%' : 0, bottom: i === last ? '50%' : 0 }} />
              {inStretch && <span className="pointer-events-none absolute left-0 w-0.5 bg-[var(--text-secondary)]" style={{ top: i === stretch!.from ? '50%' : 0, bottom: i === stretch!.to ? '50%' : 0 }} />}
              {inStretch && (i === stretch!.from || i === stretch!.to) && <span className="pointer-events-none absolute left-0 top-1/2 h-0.5 w-3 bg-[var(--text-secondary)]" />}
              <span
                className="absolute rounded-full"
                style={{ ...swatchStyle(mode, steps[i], !!s.uncertain), width: dot, height: dot, left: 20 - dot / 2, opacity: faded(s) ? 0.35 : 1, outline: active === i ? '2px solid var(--text-primary)' : undefined, outlineOffset: 2 }}
              />
              {isNamed && (
                <span className="ml-10 flex min-w-0 flex-1 items-baseline gap-2">
                  <span className={`min-w-0 flex-1 break-words py-0.5 text-sm leading-5 ${i === 0 || i === last || inStretch ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{shortStopName(s.name)}</span>
                  <span className={`shrink-0 text-xs ${faded(s) ? 'text-[var(--text-dim)]' : 'text-[var(--text-secondary)]'}`}>{valueText(s, mode)}</span>
                </span>
              )}
              {stretch && i === stretch.from && <span className="pointer-events-none absolute right-0 text-xs font-bold text-[var(--text-primary)]" style={{ top: isNamed ? -14 : -10 }}>{stretch.label}</span>}
            </div>
          );
        })}
      </div>
      {activeStop && (
        <div className="mt-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-header)] px-3 py-2 text-xs">
          <div className="font-bold text-[var(--text-primary)]">{stopDetail(activeStop).name}</div>
          {stopDetail(activeStop).lines.map(l => <div key={l} className="mt-0.5 text-[var(--text-secondary)]">{l}</div>)}
        </div>
      )}
    </div>
  );
}
