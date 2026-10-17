import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import DataTable from '../ui/DataTable';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isMajorStop } from '../../utils/stopLabel';
import {
  MIN_N, delayText, labelWidth, pct, shortStopName, stopDetail, stopN, stopStep, stretchSpan,
  type RouteStripMode, type RouteStripStop, type Step,
} from './routeStripModel';
import { StripLegend, Tooltip, swatchStyle } from './RouteStrip';
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
const TRACK_H = 22;
/** Extra height above a track that carries a marked stretch (its bracket and name). */
const BRACKET_H = 28;
const LABEL_H = 22;
const ROW_GAP = 10;
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

/** Which labels fit on one line: `want` first (always tried), then `majors` evenly spaced candidates; each is centred on its x, kept inside the plot, and none overlaps another. */
function fitLabels(items: ReadonlyArray<{ x: number; text: string }>, want: readonly number[], majors: number, min: number, max: number, gap = 12): number[] {
  const widths = items.map(i => labelWidth(i.text) + 6);
  const span = (i: number): [number, number] => { const l = Math.max(min, Math.min(max - widths[i], items[i].x - widths[i] / 2)); return [l, l + widths[i]]; };
  const placed: number[] = [];
  const fits = (i: number) => { const [a, b] = span(i); return placed.every(j => { const [c, d] = span(j); return b + gap <= c || d + gap <= a; }); };
  const tryAdd = (i: number) => { if (i < 0 || i >= items.length || placed.includes(i) || !fits(i)) return false; placed.push(i); return true; };
  want.forEach(tryAdd);
  const rest = items.map((_, i) => i).filter(i => !want.includes(i));
  for (let k = 1; k <= majors && rest.length; k++) {
    const target = Math.round((k * (rest.length - 1)) / (majors + 1));
    for (const d of [0, 1, -1, 2, -2]) if (tryAdd(rest[target + d] ?? -1)) break;
  }
  return placed;
}

/** Where each stop sits: a slot along the line (shared by every track) and a row (0 is the trunk's own line). A fork on a lower row leaves one empty slot beside the trunk, so its curve has room. */
interface Placed { stop: RouteStripStop; slot: number; row: number }

function layout(m: BranchModel) {
  const gap = (k: number) => (k > 0 ? 1 : 0);
  const padIn = Math.max(0, ...m.starts.map((f, k) => f.length + gap(k)));
  const padOut = Math.max(0, ...m.ends.map((f, k) => f.length + gap(k)));
  const nTrunk = m.trunk.length;
  const placed: Placed[] = [];
  m.starts.forEach((f, k) => f.forEach((stop, j) => placed.push({ stop, slot: padIn - gap(k) - f.length + j, row: k })));
  m.trunk.forEach((stop, i) => placed.push({ stop, slot: padIn + i, row: 0 }));
  m.ends.forEach((f, k) => f.forEach((stop, j) => placed.push({ stop, slot: padIn + nTrunk + gap(k) + j, row: k })));
  return { padIn, nTrunk, padOut, slots: padIn + nTrunk + padOut, rows: Math.max(1, m.starts.length, m.ends.length), placed };
}

/**
 * One direction of a route that runs more than one pattern: the delay and bunching tracks of RouteStrip, with the stops
 * every pattern serves as one shared line (the trunk) that splits into parallel lines, one per branch, where the
 * patterns differ. Each line is a pair of tracks with its stop names underneath: the trunk names a few stops and both
 * ends, a branch names the stop where it ends. A branch stop shows its own delay; bunching is only measured along the
 * main pattern, so branch stops show it as not measured. Phones get a vertical list: the branches one after another.
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
  const anyUncertain = stops.some(s => modes.some(m => !!s.uncertain));
  const anyFaded = stops.some(s => modes.some(m => faded(s, m)));
  const anyMissing = stops.some(s => modes.some(m => stopStep(s, m) == null));
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

  // Horizontal geometry: one block per row (a pair of tracks, then the names under it), all sharing the slots' x positions.
  const plotW = Math.max(0, width - GUTTER);
  const inner = Math.max(0, plotW - INSET * 2);
  const step = lay.slots > 1 ? inner / (lay.slots - 1) : inner;
  const xOf = (slot: number) => GUTTER + INSET + slot * step;
  const dot = Math.max(6, Math.min(12, Math.floor(step - 3)));
  // A track with a marked stretch (Delays start, Bunching forms) on the trunk's line gets room above it for the bracket.
  const trunkRow = useMemo(() => lay.placed.filter(p => p.row === 0).sort((a, b) => a.slot - b.slot), [lay]);
  const marks = useMemo(() => modes.map(mode => {
    const span = stretchSpan(trunkRow.map(p => p.stop), mode === 'delay' ? model.delaysStart : model.bunchingForms, mode === 'delay' ? 'delaysStart' : 'bunchingForms');
    return span ? { label: span.label, a: trunkRow[span.from].slot, b: trunkRow[span.to].slot } : null;
  }), [modes, trunkRow, model]);
  const heights = modes.map((_, t) => TRACK_H + (marks[t] ? BRACKET_H : 0));
  const pairH = heights.reduce((a, b) => a + b, 0);
  const rowH = pairH + LABEL_H + ROW_GAP;
  const yOf = (row: number, t: number) => row * rowH + heights.slice(0, t).reduce((a, b) => a + b, 0) + heights[t] - TRACK_H / 2;
  const total = lay.rows * rowH - ROW_GAP;
  const placedAt = new Map(lay.placed.map(p => [p.stop.stopId, p]));

  // Names: row 0 names both ends of its line and a few trunk stops; every other row names the stop where its branch ends.
  const labels = useMemo(() => {
    if (vertical || width === 0) return [] as Array<{ stop: RouteStripStop; row: number; x: number; end: boolean }>;
    const out: Array<{ stop: RouteStripStop; row: number; x: number; end: boolean }> = [];
    const row0 = lay.placed.filter(p => p.row === 0).sort((a, b) => a.slot - b.slot);
    const items = row0.map(p => ({ x: xOf(p.slot), text: shortStopName(p.stop.name) }));
    const picked = fitLabels(items, [0, items.length - 1], Math.max(2, Math.min(6, Math.floor(plotW / 150))), GUTTER, width);
    picked.forEach(i => out.push({ stop: row0[i].stop, row: 0, x: items[i].x, end: i === 0 || i === items.length - 1 }));
    model.endLabels.filter(e => !e.onTrunk && e.row > 0).forEach(e => { const p = placedAt.get(e.stop.stopId); if (p) out.push({ stop: e.stop, row: e.row, x: xOf(p.slot), end: true }); });
    return out;
  }, [vertical, width, plotW, model, lay]); // eslint-disable-line react-hooks/exhaustive-deps

  const rails = (t: number) => {
    const line = (d: string, key: string) => <path key={key} d={d} fill="none" stroke="var(--text-dim)" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />;
    const out = [];
    const firstSlot = (k: number) => lay.padIn - (k > 0 ? 1 : 0) - model.starts[k].length;
    const first0 = model.starts[0] ? firstSlot(0) : lay.padIn;
    const last0 = model.ends[0] ? lay.padIn + lay.nTrunk + model.ends[0].length - 1 : lay.padIn + lay.nTrunk - 1;
    out.push(line(`M ${xOf(first0)} ${yOf(0, t)} H ${xOf(last0)}`, 'main'));
    model.starts.forEach((f, k) => {
      if (k === 0) return;
      const x1 = xOf(lay.padIn - 1 - 1), x2 = xOf(lay.padIn), dx = (x2 - x1) / 2;
      out.push(line(`M ${xOf(firstSlot(k))} ${yOf(k, t)} H ${x1} C ${x1 + dx} ${yOf(k, t)} ${x2 - dx} ${yOf(0, t)} ${x2} ${yOf(0, t)}`, `s${k}`));
    });
    model.ends.forEach((f, k) => {
      if (k === 0) return;
      const x1 = xOf(lay.padIn + lay.nTrunk - 1), x2 = xOf(lay.padIn + lay.nTrunk + 1), dx = (x2 - x1) / 2;
      out.push(line(`M ${x1} ${yOf(0, t)} C ${x1 + dx} ${yOf(0, t)} ${x2 - dx} ${yOf(k, t)} ${x2} ${yOf(k, t)} H ${xOf(lay.padIn + lay.nTrunk + 1 + f.length - 1)}`, `e${k}`));
    });
    return out;
  };

  /** The stop nearest the pointer along the line, among the stops on the row it points at. */
  function pickStop(e: React.PointerEvent<HTMLDivElement>): string | null {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left, y = e.clientY - box.top;
    const row = Math.max(0, Math.min(lay.rows - 1, Math.floor(y / rowH)));
    const pool = lay.placed.some(p => p.row === row) ? lay.placed.filter(p => p.row === row) : lay.placed;
    let best: { id: string; d: number } | null = null;
    for (const { stop, slot } of pool) {
      const d = Math.abs(xOf(slot) - x);
      if (!best || d < best.d) best = { id: stop.stopId, d };
    }
    return best ? best.id : null;
  }

  const horizontal = (
    <div className="relative select-none" style={{ height: total }} aria-hidden="true">
      {modes.map((mode, t) => (
        <span key={mode} className="absolute left-0 text-xs font-bold text-[var(--text-secondary)]" style={{ top: yOf(0, t) - 8, width: GUTTER - 8 }}>{TRACK_NAME[mode]}</span>
      ))}
      <svg className="pointer-events-none absolute left-0 top-0" width={width} height={total} style={{ overflow: 'visible' }}>
        {modes.map((_, t) => rails(t))}
        {marks.map((m, t) => m && (
          <g key={`mark${t}`}>
            <path d={`M ${xOf(m.a) - 7} ${yOf(0, t) - 9} V ${yOf(0, t) - 14} H ${xOf(m.b) + 7} V ${yOf(0, t) - 9}`} fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <text x={xOf(m.a) - 7} y={yOf(0, t) - 19} fontSize={12} fontWeight={700} fill="var(--text-primary)">{m.label}</text>
          </g>
        ))}
      </svg>
      {modes.map((mode, t) => lay.placed.map(({ stop, slot, row }) => {
        const on = selected === stop.stopId, hot = active === stop.stopId;
        return (
          <span
            key={`${mode}-${stop.stopId}`}
            className="absolute rounded-full transition-transform"
            style={{
              ...swatchStyle(mode, stopStep(stop, mode), !!stop.uncertain),
              width: dot, height: dot, left: xOf(slot) - dot / 2, top: yOf(row, t) - dot / 2,
              opacity: faded(stop, mode) ? 0.35 : 1,
              transform: hot || on ? 'scale(1.45)' : undefined,
              outline: on ? '2px solid var(--accent)' : hot ? '2px solid var(--text-primary)' : undefined,
              outlineOffset: 2,
            }}
          />
        );
      }))}
      <div
        className="absolute inset-0 touch-pan-y"
        onPointerMove={e => { if (e.pointerType === 'mouse') setActive(pickStop(e)); }}
        onPointerDown={e => { const id = pickStop(e); setActive(id); if (id) onSelect?.(id); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
      />
      {labels.map(l => {
        const w = labelWidth(shortStopName(l.stop.name)) + 6;
        const left = Math.max(GUTTER, Math.min(width - w, l.x - w / 2));
        return (
          <span
            key={`${l.row}-${l.stop.stopId}`}
            className={`pointer-events-none absolute whitespace-nowrap text-center text-xs leading-4 ${l.end ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`}
            style={{ left, width: w, top: l.row * rowH + pairH + 3 }}
            title={l.stop.name}
          >{shortStopName(l.stop.name)}</span>
        );
      })}
      {activeStop && placedAt.get(activeStop.stopId) && <Tooltip stop={activeStop} x={xOf(placedAt.get(activeStop.stopId)!.slot)} width={width} top={yOf(placedAt.get(activeStop.stopId)!.row, 0) + pairH + 14} />}
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
        {vertical ? <VerticalBranches model={model} modes={modes} minN={minN} allStops={allStops} active={active ?? selected} setActive={id => { setActive(id); onSelect?.(id); }} /> : width > 0 ? horizontal : null}
      </div>
      {vertical && stops.length > 2 && (
        <button type="button" onClick={() => setAllStops(v => !v)} aria-expanded={allStops} className="mt-2 text-xs font-bold text-[var(--accent)]">
          {allStops ? 'Show key stops only' : `Show all ${stops.length} stops`}
        </button>
      )}
      <StripLegend modes={modes} anyUncertain={anyUncertain} anyFaded={anyFaded} anyMissing={anyMissing} minN={minN} />
      {table}
    </figure>
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
                  return <span key={m} className="absolute rounded-full" style={{ ...swatchStyle(m, stopStep(s, m), !!s.uncertain), width: size, height: size, left: COL_X[k] - size / 2, top: `calc(50% - ${size / 2}px)`, opacity: stopN(s, m) > 0 && stopN(s, m) < minN ? 0.35 : 1, outline: on ? '2px solid var(--accent)' : undefined, outlineOffset: 1 }} />;
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
