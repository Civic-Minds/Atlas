import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import DataTable from '../ui/DataTable';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isMajorStop } from '../../utils/stopLabel';
import {
  LEGEND_TITLE, MIN_N, STEP_LABELS, delayText, labelWidth, pct, shortStopName, stepColor, stepFor, stopDetail, stopN, stopValue,
  type RouteStripMode, type RouteStripStop, type Step,
} from './routeStripModel';
import { allBranchStops, type BranchModel } from './branchStripModel';

export interface BranchStripProps {
  model: BranchModel;
  /** The picked stop's id: drawn marked on every track. */
  selected?: string | null;
  /** Called with a stop's id when it is clicked, tapped, or chosen with Enter. */
  onSelect?: (stopId: string) => void;
  modes?: readonly RouteStripMode[];
  minN?: number;
  /** The strip becomes a vertical list on phones (under 480px), or when its own column is narrower than this (px). Default 360. */
  verticalBelow?: number;
  className?: string;
}

const INSET = 10;
const GUTTER = 72;
const LABEL_H = 16;
const DOT_H = 24;
const ROW_H = LABEL_H + DOT_H;
const TRACK_GAP = 8;
const TRACK_NAME: Record<RouteStripMode, string> = { delay: 'Delay', bunching: 'Bunching' };

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
 * Which trunk stops get a name under the lines: both ends of the trunk, then `majors` evenly spaced stops (nudged to a
 * neighbour when the even spot would overlap). Each label is centred on its stop; none overlaps another.
 */
function pickTrunkLabels(xs: readonly number[], widths: readonly number[], majors: number, min: number, max: number, gap = 10): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const placed: number[] = [];
  const span = (i: number): [number, number] => { const l = Math.max(min, Math.min(max - widths[i], xs[i] - widths[i] / 2)); return [l, l + widths[i]]; };
  const fits = (i: number) => { const [a, b] = span(i); return placed.every(j => { const [c, d] = span(j); return b + gap <= c || d + gap <= a; }); };
  const tryAdd = (i: number) => { if (i < 0 || i >= n || placed.includes(i) || !fits(i)) return false; placed.push(i); return true; };
  tryAdd(0);
  tryAdd(n - 1);
  for (let k = 1; k <= majors; k++) {
    const target = Math.round((k * (n - 1)) / (majors + 1));
    for (const d of [0, 1, -1, 2, -2]) if (tryAdd(target + d)) break;
  }
  return placed.sort((a, b) => a - b);
}

/** Where each stop sits: a slot along the line (shared by every track) and a row (0 is the trunk's own line). */
interface Placed { stop: RouteStripStop; slot: number; row: number }

function layout(m: BranchModel) {
  const nIn = Math.max(0, ...m.starts.map(f => f.length));
  const nTrunk = m.trunk.length;
  const nOut = Math.max(0, ...m.ends.map(f => f.length));
  const placed: Placed[] = [];
  m.starts.forEach((f, k) => f.forEach((stop, j) => placed.push({ stop, slot: nIn - f.length + j, row: k })));
  m.trunk.forEach((stop, i) => placed.push({ stop, slot: nIn + i, row: 0 }));
  m.ends.forEach((f, k) => f.forEach((stop, j) => placed.push({ stop, slot: nIn + nTrunk + j, row: k })));
  return { nIn, nTrunk, nOut, slots: nIn + nTrunk + nOut, rows: Math.max(1, m.starts.length, m.ends.length), placed };
}

/**
 * One direction of a route that runs more than one pattern: the delay and bunching tracks of RouteStrip, but with the
 * stops every pattern serves as one shared line (the trunk) that forks into a line per branch where the patterns
 * differ, each branch named by its end stop. A stop on a branch shows its own delay; bunching is only measured along
 * the main pattern, so branch stops show it as not measured. Phones get a vertical list: the branches one after
 * another around the trunk.
 */
export default function BranchStrip({ model, selected = null, onSelect, modes = ['delay', 'bunching'], minN = MIN_N, verticalBelow = 360, className = '' }: BranchStripProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<string | null>(null);
  const [allStops, setAllStops] = useState(false);
  const tableId = useId();
  const liveId = useId();
  const phone = useMediaQuery('(max-width: 479px)');
  const vertical = phone || (width > 0 && width < verticalBelow);
  const stops = useMemo(() => allBranchStops(model), [model]);
  const lay = useMemo(() => layout(model), [model]);
  const faded = (s: RouteStripStop, mode: RouteStripMode) => stopN(s, mode) > 0 && stopN(s, mode) < minN;
  const anyUncertain = stops.some(s => s.uncertain);
  const anyFaded = stops.some(s => modes.some(m => faded(s, m)));
  const anyMissing = stops.some(s => modes.some(m => stepFor(m, stopValue(s, m)) == null));
  const activeStop = stops.find(s => s.stopId === active) ?? null;
  const announce = activeStop ? `${activeStop.name}. ${stopDetail(activeStop).lines.join('. ')}.` : '';
  const summary = `${model.label}: ${model.trunk.length} stops on the shared line, then ${model.starts.length + model.ends.length} branches, ending at ${[...new Set(model.endLabels.map(e => e.stop.name))].join(', ')}. Use the left and right arrow keys to hear each stop.`;

  const onKey = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const at = stops.findIndex(s => s.stopId === active);
    const go = (i: number) => { e.preventDefault(); setActive(stops[Math.max(0, Math.min(stops.length - 1, i))].stopId); };
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(at < 0 ? 0 : at + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(at < 0 ? stops.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(stops.length - 1);
    else if (e.key === 'Escape') setActive(null);
    else if ((e.key === 'Enter' || e.key === ' ') && active && onSelect) { e.preventDefault(); onSelect(active); }
  }, [stops, active, onSelect]);

  const legend = (
    <div className="mt-2 space-y-1 text-xs text-[var(--text-legend)]">
      {modes.map(mode => (
        <div key={mode} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold text-[var(--text-secondary)]">{LEGEND_TITLE[mode]}:</span>
          {([0, 1, 2] as const).map(step => <span key={step} className="inline-flex items-center gap-1.5"><Swatch mode={mode} step={step} />{STEP_LABELS[mode][step]}</span>)}
        </div>
      ))}
      {(anyUncertain || anyFaded || anyMissing) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {anyUncertain && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={1} uncertain />Less exact</span>}
          {anyFaded && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={1} faded />Fewer than {minN} departures or gaps</span>}
          {anyMissing && <span className="inline-flex items-center gap-1.5"><Swatch mode={modes[0]} step={null} />Not measured</span>}
        </div>
      )}
    </div>
  );

  const table = (
    <div id={tableId} className="sr-only">
      <DataTable
        caption={`${model.label}: delay and bunching at each stop`}
        rows={stops}
        rowKey={s => s.stopId}
        columns={[
          { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: s => s.name },
          { key: 'delay', header: 'Typical delay', cell: s => (s.delayMin != null && s.n > 0 ? delayText(s.delayMin) : 'not measured') },
          { key: 'late', header: 'Late', cell: s => (s.lateShare != null && s.n > 0 ? pct(s.lateShare) : '') },
          { key: 'bunch', header: 'Gaps off', cell: s => (s.bunchingShare != null && (s.bunchingN ?? s.n) > 0 ? pct(s.bunchingShare) : 'not measured') },
          { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
        ]}
      />
    </div>
  );

  // Horizontal geometry.
  const plotW = Math.max(0, width - GUTTER);
  const inner = Math.max(0, plotW - INSET * 2);
  const step = lay.slots > 1 ? inner / (lay.slots - 1) : inner;
  const xOf = (slot: number) => GUTTER + INSET + slot * step;
  const dot = Math.max(6, Math.min(12, Math.floor(step - 3)));
  const trackH = lay.rows * ROW_H;
  const trackTop = (t: number) => t * (trackH + TRACK_GAP);
  const yOf = (t: number, row: number) => trackTop(t) + row * ROW_H + LABEL_H + DOT_H / 2;
  const labelsTop = modes.length * (trackH + TRACK_GAP);
  const trunkText = model.trunk.map(s => shortStopName(s.name));
  const trunkLabels = useMemo(() => (vertical || width === 0 ? [] : pickTrunkLabels(model.trunk.map((_, i) => xOf(lay.nIn + i)), trunkText.map(t => labelWidth(t) + 6), Math.max(2, Math.min(6, Math.floor(plotW / 150))), GUTTER, width)), [vertical, width, plotW, model]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineY = (t: number, r: number) => yOf(t, r);
  const placedAt = new Map(lay.placed.map(p => [p.stop.stopId, p]));

  const horizontal = (
    <div className="relative select-none" style={{ height: labelsTop + 24 }} aria-hidden="true">
      {modes.map((mode, t) => (
        <Fragment key={mode}>
          <span className="absolute left-0 text-xs font-bold text-[var(--text-secondary)]" style={{ top: lineY(t, 0) - 8, width: GUTTER - 8 }}>{TRACK_NAME[mode]}</span>
          <svg className="pointer-events-none absolute left-0 top-0" width={width} height={labelsTop} style={{ overflow: 'visible' }}>
            {(() => {
              const line = (x1: number, y1: number, x2: number, y2: number, key: string) => <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--text-dim)" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />;
              const out = [];
              const first0 = model.starts[0] ? lay.nIn - model.starts[0].length : lay.nIn;
              const last0 = model.ends[0] ? lay.nIn + lay.nTrunk + model.ends[0].length - 1 : lay.nIn + lay.nTrunk - 1;
              out.push(line(xOf(first0), lineY(t, 0), xOf(last0), lineY(t, 0), 'main'));
              model.starts.forEach((f, k) => {
                if (k === 0) return;
                out.push(line(xOf(lay.nIn - f.length), lineY(t, k), xOf(lay.nIn - 1), lineY(t, k), `s${k}`), line(xOf(lay.nIn - 1), lineY(t, k), xOf(lay.nIn), lineY(t, 0), `sj${k}`));
              });
              model.ends.forEach((f, k) => {
                if (k === 0) return;
                out.push(line(xOf(lay.nIn + lay.nTrunk), lineY(t, k), xOf(lay.nIn + lay.nTrunk + f.length - 1), lineY(t, k), `e${k}`), line(xOf(lay.nIn + lay.nTrunk - 1), lineY(t, 0), xOf(lay.nIn + lay.nTrunk), lineY(t, k), `ej${k}`));
              });
              return out;
            })()}
          </svg>
          {lay.placed.map(({ stop, slot, row }) => {
            const on = selected === stop.stopId, hot = active === stop.stopId;
            return (
              <span
                key={`${mode}-${stop.stopId}`}
                className="absolute cursor-pointer rounded-full transition-transform"
                style={{
                  ...swatchStyle(mode, stepFor(mode, stopValue(stop, mode)), !!stop.uncertain),
                  width: dot, height: dot, left: xOf(slot) - dot / 2, top: lineY(t, row) - dot / 2,
                  opacity: faded(stop, mode) ? 0.35 : 1,
                  transform: hot || on ? 'scale(1.45)' : undefined,
                  outline: on ? '2px solid var(--accent)' : hot ? '2px solid var(--text-primary)' : undefined,
                  outlineOffset: 2,
                }}
              />
            );
          })}
        </Fragment>
      ))}
      <div
        className="absolute inset-0 touch-pan-y"
        onPointerMove={e => { if (e.pointerType === 'mouse') setActive(pickStop(e)); }}
        onPointerDown={e => { const id = pickStop(e); setActive(id); if (id) onSelect?.(id); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
      />
      {/* Names where a branch ends, above its line. */}
      {model.endLabels.filter(e => !e.onTrunk).map(e => {
        const p = placedAt.get(e.stop.stopId);
        if (!p) return null;
        const x = xOf(p.slot);
        const text = shortStopName(e.stop.name);
        return (
          <span
            key={`${e.side}-${e.stop.stopId}`}
            className="pointer-events-none absolute whitespace-nowrap text-xs font-bold text-[var(--text-primary)]"
            style={{ top: trackTop(0) + e.row * ROW_H, ...(e.side === 'start' ? { left: Math.max(GUTTER, x - 6) } : { right: Math.max(0, width - x - 6) }) }}
            title={e.stop.name}
          >{text}</span>
        );
      })}
      {/* Names along the shared line. */}
      {trunkLabels.map(i => {
        const w = labelWidth(trunkText[i]);
        const x = xOf(lay.nIn + i);
        const left = Math.max(GUTTER, Math.min(width - w, x - w / 2));
        return <span key={i} className="pointer-events-none absolute whitespace-normal break-words text-center text-xs leading-4 text-[var(--text-dim)]" style={{ left, width: w, top: labelsTop }}>{trunkText[i]}</span>;
      })}
      {activeStop && placedAt.get(activeStop.stopId) && <Tooltip stop={activeStop} x={xOf(placedAt.get(activeStop.stopId)!.slot)} width={width} top={labelsTop + 26} />}
    </div>
  );

  /** The stop nearest the pointer along the line, among the stops on the row it points at (the tracks repeat the same rows). */
  function pickStop(e: React.PointerEvent<HTMLDivElement>): string | null {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    const row = Math.max(0, Math.min(lay.rows - 1, Math.floor((y % (trackH + TRACK_GAP)) / ROW_H)));
    const pool = lay.placed.some(p => p.row === row) ? lay.placed.filter(p => p.row === row) : lay.placed;
    let best: { id: string; d: number } | null = null;
    for (const { stop, slot } of pool) {
      const d = Math.abs(xOf(slot) - x);
      if (!best || d < best.d) best = { id: stop.stopId, d };
    }
    return best ? best.id : null;
  }

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
        {vertical ? <VerticalBranches model={model} modes={modes} minN={minN} allStops={allStops} active={active ?? selected} setActive={id => { setActive(id); onSelect?.(id); }} /> : width > 0 ? horizontal : null}
      </div>
      {vertical && stops.length > 2 && (
        <button type="button" onClick={() => setAllStops(v => !v)} aria-expanded={allStops} className="mt-2 text-xs font-bold text-[var(--accent)]">
          {allStops ? 'Show key stops only' : `Show all ${stops.length} stops`}
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

const COL_X = [16, 70];
const NAME_LEFT = 94;

/**
 * Phones: the lead-in branches, the shared line, then the lead-out branches, one after another, on two rails (delay and
 * bunching). A branch is named by its end stop above its stops and marked with a bar beside its names. Only the key
 * stops are named (both ends of each part and stations); "Show all stops" names them all.
 */
function VerticalBranches({ model, modes, minN, allStops, active, setActive }: {
  model: BranchModel; modes: readonly RouteStripMode[]; minN: number; allStops: boolean; active: string | null; setActive: (id: string) => void;
}) {
  const sections: Array<{ key: string; branch: boolean; title: string | null; stops: RouteStripStop[] }> = [
    ...model.starts.map((f, k) => ({ key: `s${k}`, branch: true, title: shortStopName(f[0].name), stops: f })),
    { key: 'trunk', branch: false, title: null, stops: model.trunk },
    ...model.ends.map((f, k) => ({ key: `e${k}`, branch: true, title: shortStopName(f[f.length - 1].name), stops: f })),
  ];
  const rails = (
    <>
      {modes.map((m, k) => <span key={m} className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-[var(--text-dim)] opacity-40" style={{ left: COL_X[k] - 1 }} />)}
    </>
  );
  return (
    <div aria-hidden="true">
      <div className="relative h-5 text-xs font-bold text-[var(--text-secondary)]">
        {modes.map((m, k) => <span key={m} className="absolute top-0 -translate-x-1/2 whitespace-nowrap" style={{ left: COL_X[k] }}>{TRACK_NAME[m]}</span>)}
      </div>
      {sections.map(sec => (
        <div key={sec.key}>
          {sec.title && (
            <div className="relative" style={{ paddingLeft: NAME_LEFT }}>
              {rails}
              <div className="py-0.5 text-xs font-bold leading-5 text-[var(--text-primary)]">{sec.title}</div>
            </div>
          )}
          {sec.stops.map((s, i) => {
            const named = allStops || i === 0 || i === sec.stops.length - 1 || isMajorStop(s.name);
            const on = active === s.stopId;
            return (
              <button key={s.stopId} type="button" tabIndex={-1} onClick={() => setActive(s.stopId)} className={`relative flex w-full items-center rounded-md text-left ${on ? 'bg-[var(--accent-selected-bg)]' : ''}`} style={{ minHeight: named ? 22 : 12, paddingLeft: NAME_LEFT }}>
                {rails}
                {modes.map((m, k) => {
                  const size = named ? 10 : 6;
                  return <span key={m} className="absolute rounded-full" style={{ ...swatchStyle(m, stepFor(m, stopValue(s, m)), !!s.uncertain), width: size, height: size, left: COL_X[k] - size / 2, top: `calc(50% - ${size / 2}px)`, opacity: stopN(s, m) > 0 && stopN(s, m) < minN ? 0.35 : 1, outline: on ? '2px solid var(--accent)' : undefined, outlineOffset: 1 }} />;
                })}
                {sec.branch && <span className="pointer-events-none absolute bottom-0 top-0 w-0.5 bg-[var(--text-secondary)]" style={{ left: NAME_LEFT - 10 }} />}
                {named && <span className="min-w-0 flex-1 break-words py-0.5 text-sm leading-5 text-[var(--text-secondary)]">{shortStopName(s.name)}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
