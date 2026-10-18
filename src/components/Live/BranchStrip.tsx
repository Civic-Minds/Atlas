import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import DataTable from '../ui/DataTable';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { isMajorStop } from '../../utils/stopLabel';
import {
  MIN_N, bunchParts, delayText, labelWidth, pct, shortStopName, shownDelayMin, stopDetail, stopN, stopStep, stretchSpan,
  type RouteStripMode, type RouteStripStop, type Step,
} from './routeStripModel';
import { StripLegend, Tooltip, swatchStyle } from './RouteStrip';
import { allBranchStops, columnsOf, type BranchModel } from './branchStripModel';

export interface BranchStripProps {
  model: BranchModel;
  /** The picked stop's id: drawn marked on every track. */
  selected?: string | null;
  /** Called with a stop's id when it is clicked, tapped, or chosen with Enter. */
  onSelect?: (stopId: string) => void;
  modes?: readonly RouteStripMode[];
  /** Keep the room for the marked-stretch bracket even when this strip has none, so two strips side by side start at the same height. */
  reserveBracket?: boolean;
  /** Use the two-line row height even when this strip's names fit on one line, for the same reason. */
  twoLineNames?: boolean;
  minN?: number;
  /** The strip becomes a vertical list on phones (under 480px), or when its own column is narrower than this (px). Default 360. */
  verticalBelow?: number;
  className?: string;
}

const INSET = 10;
const GUTTER = 128;
/** One line (pattern) of one measure. */
const ROW_H_ONE = 24;
/** The row height when a line's name wraps to two lines in the gutter, so neighbouring names never touch. */
const ROW_H_TWO_LINE = 38;
/** The measure's name above its group of lines. */
const HEAD_H = 18;
/** Extra height above a group that carries a marked stretch (its bracket and name). */
const BRACKET_H = 28;
const LABEL_H = 22;
const GROUP_GAP = 10;
const TRACK_NAME: Record<RouteStripMode, string> = { delay: 'Delay', bunching: 'Bunching' };

let measurer: CanvasRenderingContext2D | null | undefined;
/** Whether a line's name needs two lines in the gutter (measured in the gutter's own 12px type; about 6px a letter where there is no canvas). */
function nameWraps(name: string): boolean {
  if (measurer === undefined) {
    try { measurer = typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent) ? null : document.createElement('canvas').getContext('2d'); } catch { measurer = null; }
    if (measurer) measurer.font = '12px Inter, system-ui, sans-serif';
  }
  const w = measurer ? measurer.measureText(name).width : name.length * 6;
  return w > GUTTER - 8;
}

/** Every line is named by where it ends. If two lines end at the same stop, every line is named "First – Last" instead, so the names read in one style. */
export function branchRowNames(model: BranchModel): string[] {
  const ends = model.lines.map(l => shortStopName(l.at(-1)!.name));
  const clash = ends.some((e, i) => ends.indexOf(e) !== i);
  return model.lines.map((l, r) => (clash ? `${shortStopName(l[0].name)} – ${ends[r]}` : ends[r]));
}

/** Whether any line's name needs two lines in the gutter. */
export const branchNamesWrap = (model: BranchModel): boolean => branchRowNames(model).some(nameWraps);

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

/**
 * One direction of a route that runs more than one pattern: the delay and bunching tracks of RouteStrip, with the stops
 * every pattern serves as one shared line (the trunk) that splits into parallel lines, one per branch, where the
 * patterns differ. Each line is a pair of tracks with its stop names underneath: the trunk names a few stops and both
 * ends, a branch names the stop where it ends. A branch stop shows its own delay; bunching is only measured along the
 * main pattern, so branch stops show it as not measured. Phones get a vertical list: the branches one after another.
 */
export default function BranchStrip({ model, selected = null, onSelect, modes = ['delay', 'bunching'], reserveBracket = false, twoLineNames = false, minN = MIN_N, verticalBelow = 360, className = '' }: BranchStripProps) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<string | null>(null);
  const [allStops, setAllStops] = useState(false);
  const tableId = useId();
  const liveId = useId();
  const phone = useMediaQuery('(max-width: 479px)');
  const vertical = phone || (width > 0 && width < verticalBelow);
  const stops = useMemo(() => allBranchStops(model), [model]);
  const faded = (s: RouteStripStop, mode: RouteStripMode) => stopN(s, mode) > 0 && stopN(s, mode) < minN;
  const anyUncertain = stops.some(s => modes.some(m => !!s.uncertain));
  const anyFaded = stops.some(s => modes.some(m => faded(s, m)));
  const anyMissing = stops.some(s => modes.some(m => stopStep(s, m) == null));
  const anyEarly = stops.some(s => modes.includes('delay') && stopStep(s, 'delay') === 'early');
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
          { key: 'delay', header: 'Typical delay', cell: s => (shownDelayMin(s) != null && s.n > 0 ? delayText(shownDelayMin(s)!) : 'not measured') },
          { key: 'late', header: 'Late', cell: s => (s.lateShare != null && s.n > 0 ? pct(s.lateShare) : '') },
          { key: 'bunch', header: 'Gaps off', cell: s => { const b = bunchParts(s); return b ? `${b.total}%` : 'not measured'; } },
          { key: 'n', header: 'Departures', cell: s => s.n.toLocaleString() },
        ]}
      />
    </div>
  );

  // Horizontal geometry: one column per distinct stop (shared by every line), one row per pattern, grouped by measure.
  const cols = useMemo(() => columnsOf(model.lines), [model]);
  const colOf = useMemo(() => new Map(cols.map((id, i) => [id, i])), [cols]);
  const byId = useMemo(() => new Map(stops.map(s => [s.stopId, s])), [stops]);
  const plotW = Math.max(0, width - GUTTER);
  const inner = Math.max(0, plotW - INSET * 2);
  const step = cols.length > 1 ? inner / (cols.length - 1) : inner;
  const xOf = (col: number) => GUTTER + INSET + col * step;
  const dot = Math.max(5, Math.min(12, Math.floor(step - 2)));
  // Every line is named by where it ends. If two lines end at the same stop, every line is named "First – Last" instead, so the names read in one style.
  const rowNames = useMemo(() => branchRowNames(model), [model]);
  // A stop only one line serves is that line's own terminal: its start is named beside the line (in the empty space before it), not down in the shared name row, where it would read as belonging to the bottom line.
  const serving = useMemo(() => {
    const m = new Map<string, number>();
    model.lines.forEach(l => l.forEach(s => m.set(s.stopId, (m.get(s.stopId) ?? 0) + 1)));
    return m;
  }, [model]);
  // The marked stretch (Delays start, Bunching forms) sits on the main line, so its bracket goes above that group's first row.
  const mainStops = model.lines[0];
  const marks = useMemo(() => modes.map(mode => {
    const span = stretchSpan(mainStops, mode === 'delay' ? model.delaysStart : model.bunchingForms, mode === 'delay' ? 'delaysStart' : 'bunchingForms');
    return span ? { label: span.label, a: colOf.get(mainStops[span.from].stopId)!, b: colOf.get(mainStops[span.to].stopId)! } : null;
  }), [modes, mainStops, model, colOf]);
  const nLines = model.lines.length;
  const ROW_H = twoLineNames || rowNames.some(nameWraps) ? ROW_H_TWO_LINE : ROW_H_ONE;
  const groupTop: number[] = [];
  let y = 0;
  modes.forEach((_, t) => { groupTop.push(y); y += HEAD_H + (marks[t] || reserveBracket ? BRACKET_H : 0) + nLines * ROW_H + GROUP_GAP; });
  const namesTop = y;
  const total = namesTop + LABEL_H;
  const rowY = (t: number, r: number) => groupTop[t] + HEAD_H + (marks[t] || reserveBracket ? BRACKET_H : 0) + r * ROW_H + ROW_H / 2;

  // Names beside a line's start: only for a start no other line serves, and only where the name fits in the empty space before it.
  const startNames = useMemo(() => {
    if (vertical || width === 0) return [] as Array<{ stop: RouteStripStop; row: number; right: number }>;
    const out: Array<{ stop: RouteStripStop; row: number; right: number }> = [];
    model.lines.forEach((l, r) => {
      const first = l[0];
      if (serving.get(first.stopId) !== 1) return;
      const x = xOf(colOf.get(first.stopId)!) - dot / 2 - 6;
      if (x - GUTTER >= labelWidth(shortStopName(first.name)) + 6) out.push({ stop: first, row: r, right: x });
    });
    return out;
  }, [vertical, width, model, cols, dot]); // eslint-disable-line react-hooks/exhaustive-deps
  const named = useMemo(() => new Set(startNames.map(n => n.stop.stopId)), [startNames]);

  // Stop names under the columns: a terminal that lines share first, then a few more along the main line; none overlaps another. A terminal only one line serves is named by that line (its end by the line's name at the left, its start beside the line).
  const labels = useMemo(() => {
    if (vertical || width === 0) return [] as Array<{ stop: RouteStripStop; x: number; end: boolean }>;
    const exclusiveEnd = (id: string) => serving.get(id) === 1 && model.lines.some(l => l.at(-1)!.stopId === id);
    const keep = cols.map((id, i) => ({ id, i })).filter(c => !named.has(c.id) && !exclusiveEnd(c.id));
    const items = keep.map(c => ({ x: xOf(c.i), text: shortStopName(byId.get(c.id)!.name) }));
    const ends = [...new Set(model.lines.flatMap(l => [l[0], l.at(-1)!]).map(s => s.stopId))];
    const want = ends.map(id => keep.findIndex(c => c.id === id)).filter(i => i >= 0 && !named.has(keep[i].id));
    const picked = fitLabels(items, want, Math.max(2, Math.min(6, Math.floor(plotW / 150))), GUTTER, width);
    return picked.map(i => ({ stop: byId.get(keep[i].id)!, x: items[i].x, end: ends.includes(keep[i].id) }));
  }, [vertical, width, plotW, model, cols, named]); // eslint-disable-line react-hooks/exhaustive-deps

  const rails = modes.flatMap((_, t) => model.lines.map((l, r) => {
    const a = colOf.get(l[0].stopId)!, b = colOf.get(l.at(-1)!.stopId)!;
    return <path key={`${t}-${r}`} d={`M ${xOf(a)} ${rowY(t, r)} H ${xOf(b)}`} fill="none" stroke="var(--text-dim)" strokeOpacity={0.4} strokeWidth={2} strokeLinecap="round" />;
  }));

  /** The stop nearest the pointer along the line, among the stops the pointed row serves. */
  function pickStop(e: React.PointerEvent<HTMLDivElement>): string | null {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left, py = e.clientY - box.top;
    let row = 0;
    modes.forEach((_, t) => { for (let r = 0; r < nLines; r++) if (Math.abs(py - rowY(t, r)) <= ROW_H / 2) row = r; });
    const pool = model.lines[row].map(s => s.stopId);
    let best: { id: string; d: number } | null = null;
    for (const id of pool) {
      const d = Math.abs(xOf(colOf.get(id)!) - x);
      if (!best || d < best.d) best = { id, d };
    }
    return best ? best.id : null;
  }

  const horizontal = (
    <div className="relative select-none" style={{ height: total }} aria-hidden="true">
      {modes.map((mode, t) => (
        <span key={mode} className="absolute left-0 text-xs font-bold text-[var(--text-secondary)]" style={{ top: groupTop[t] + 1 }}>{TRACK_NAME[mode]}</span>
      ))}
      {modes.map((mode, t) => model.lines.map((_, r) => (
        <span key={`${mode}-${r}`} className="absolute left-0 flex items-center text-xs leading-4 text-[var(--text-dim)]" style={{ top: rowY(t, r) - ROW_H / 2, height: ROW_H, width: GUTTER - 8 }} title={rowNames[r]}>{rowNames[r]}</span>
      )))}
      <svg className="pointer-events-none absolute left-0 top-0" width={width} height={total} style={{ overflow: 'visible' }}>
        {rails}
        {marks.map((m, t) => m && (
          <g key={`mark${t}`}>
            <path d={`M ${xOf(m.a) - 7} ${rowY(t, 0) - 9} V ${rowY(t, 0) - 14} H ${xOf(m.b) + 7} V ${rowY(t, 0) - 9}`} fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {(() => {
              // The label starts at the bracket's left end; where it would run past the strip's right edge it ends at the bracket's right end instead.
              const w = m.label.length * 7 + 4, left = xOf(m.a) - 7;
              const flip = left + w > width - 2;
              return <text x={flip ? Math.min(width - 2, xOf(m.b) + 7) : left} textAnchor={flip ? 'end' : 'start'} y={rowY(t, 0) - 19} fontSize={12} fontWeight={700} fill="var(--text-primary)">{m.label}</text>;
            })()}
          </g>
        ))}
      </svg>
      {modes.map((mode, t) => model.lines.map((line, r) => line.map(stop => {
        const on = selected === stop.stopId, hot = active === stop.stopId;
        return (
          <span
            key={`${mode}-${r}-${stop.stopId}`}
            className="absolute rounded-full transition-transform"
            style={{
              ...swatchStyle(mode, stopStep(stop, mode), !!stop.uncertain),
              width: dot, height: dot, left: xOf(colOf.get(stop.stopId)!) - dot / 2, top: rowY(t, r) - dot / 2,
              opacity: faded(stop, mode) ? 0.35 : 1,
              transform: hot || on ? 'scale(1.45)' : undefined,
              outline: on ? '2px solid var(--accent)' : hot ? '2px solid var(--text-primary)' : undefined,
              outlineOffset: 2,
            }}
          />
        );
      })))}
      <div
        className="absolute inset-0 touch-pan-y"
        onPointerMove={e => { if (e.pointerType === 'mouse') setActive(pickStop(e)); }}
        onPointerDown={e => { const id = pickStop(e); setActive(id); if (id) onSelect?.(id); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setActive(null); }}
      />
      {startNames.map(n => (
        <span key={`start-${n.row}`} className="pointer-events-none absolute whitespace-nowrap text-right text-xs font-bold leading-4 text-[var(--text-primary)]" style={{ left: n.right - (labelWidth(shortStopName(n.stop.name)) + 6), width: labelWidth(shortStopName(n.stop.name)) + 6, top: rowY(0, n.row) - 8 }} title={n.stop.name}>{shortStopName(n.stop.name)}</span>
      ))}
      {labels.map(l => {
        const w = labelWidth(shortStopName(l.stop.name)) + 6;
        const left = Math.max(GUTTER, Math.min(width - w, l.x - w / 2));
        return (
          <span
            key={l.stop.stopId}
            className={`pointer-events-none absolute whitespace-nowrap text-center text-xs leading-4 ${l.end ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`}
            style={{ left, width: w, top: namesTop + 3 }}
            title={l.stop.name}
          >{shortStopName(l.stop.name)}</span>
        );
      })}
      {activeStop && colOf.has(activeStop.stopId) && <Tooltip stop={activeStop} x={xOf(colOf.get(activeStop.stopId)!)} width={width} top={namesTop + 14} />}
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
      <StripLegend modes={modes} anyUncertain={anyUncertain} anyFaded={anyFaded} anyMissing={anyMissing} anyEarly={anyEarly} minN={minN} />
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
