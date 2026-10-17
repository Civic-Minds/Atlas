import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { dateRangeText, type LiveV3 } from '../../../../shared/liveDashboard';
import { isMajorStop, shortStopName } from '../../../utils/stopLabel';
import { titleCase } from '../../../utils/format';
import { TILE } from '../../../pageStyles';
import Pill from '../../ui/Pill';
import { clockAt, dayStartEpoch, useStrings, type StringsFile } from '../StringLine';

const WINDOW_H = 2;
const BUNCHED_GAP_H = 120 / 3600;
const M_WIDE = { left: 150, right: 24, top: 10, bottom: 26 };
const M_NARROW = { left: 92, right: 12, top: 10, bottom: 26 };

/** The hour (local, 0-23) with the highest bunched share at a direction's stops, weighted by gaps; null when the file has no gap counts. */
function worstBunchingHour(v3: LiveV3, dir: number): number | null {
  let best: { h: number; share: number } | null = null;
  for (let h = 0; h < 24; h++) {
    let gaps = 0, bunched = 0;
    for (const row of Object.values(v3.stopHours?.[String(dir)] ?? {})) { const e = row[h]; if (e && e[2] && e[3] != null) { gaps += e[2]; bunched += e[2] * e[3]; } }
    if (gaps >= 100 && (!best || bunched / gaps > best.share)) best = { h, share: bunched / gaps };
  }
  return best ? best.h : null;
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Hour as it runs along the service day: after midnight counts past 24, so the early hours sit at the end of the day. */
const serviceHour = (h: number) => (h < 5 ? h + 24 : h);

interface Line { id: string; pts: Array<{ i: number; h: number }>; bunchedAt: Set<number> }

/** Each trip as points (stop place, hour), and the stops where it ran under 2 minutes behind the trip ahead. */
function buildLines(data: StringsFile, dir: number, day0: number): Line[] {
  const trips = data.trips.filter(t => t.dir === dir).map(t => ({ id: t.id, pts: t.s.map(([i, a]) => ({ i, h: (data.base + a - day0) / 3600 })).sort((p, q) => p.i - q.i) }));
  const lines: Line[] = trips.map(t => ({ id: t.id, pts: t.pts, bunchedAt: new Set<number>() }));
  const byStop = new Map<number, Array<{ line: number; h: number }>>();
  lines.forEach((l, k) => l.pts.forEach(p => { const a = byStop.get(p.i) ?? []; a.push({ line: k, h: p.h }); byStop.set(p.i, a); }));
  for (const [i, list] of byStop) {
    list.sort((a, b) => a.h - b.h);
    for (let k = 1; k < list.length; k++) if (list[k].h - list[k - 1].h < BUNCHED_GAP_H) lines[list[k].line].bunchedAt.add(i);
  }
  return lines;
}

/**
 * The full-size string-line view, opened over the planner for one route and direction: time across (a two-hour window,
 * opening on the worst bunching hour), the route's stops down the side, one line per vehicle trip. A line runs neutral
 * and turns the strip's bunching colour on the stretches that start where it ran under 2 minutes behind the vehicle
 * ahead, so bunched vehicles show as lines that touch and converge. Days and the window are chosen above the chart.
 */
export default function StringLineView({ agency, route, v3, dir, onClose }: { agency: string; route: string; v3: LiveV3; dir: number; onClose: () => void }) {
  const dates = v3.window.dates.slice(-3);
  const [date, setDate] = useState<string | null>(dates[dates.length - 1] ?? null);
  const worst = useMemo(() => worstBunchingHour(v3, dir), [v3, dir]);
  const [start, setStart] = useState(() => (worst == null ? 7 : serviceHour(worst) - 0.5));
  const state = useStrings(agency, route, date);
  const box = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hot, setHot] = useState<{ line: number; stop: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const data = state.kind === 'ready' ? state.data : null;
  const stops = data?.stops[String(dir)] ?? [];
  const day0 = useMemo(() => (data ? dayStartEpoch(data.base, data.timeZone) : 0), [data]);
  const lines = useMemo(() => (data ? buildLines(data, dir, day0) : []), [data, dir, day0]);
  const end = start + WINDOW_H;
  const visible = lines.filter(l => l.pts.some(p => p.h >= start - 0.25 && p.h <= end + 0.25));
  const M = size.w < 640 ? M_NARROW : M_WIDE;
  const w = Math.max(0, size.w - M.left - M.right), h = Math.max(0, size.h - M.top - M.bottom);
  const x = (hour: number) => M.left + ((hour - start) / WINDOW_H) * w;
  const y = (i: number) => M.top + (stops.length > 1 ? (i / (stops.length - 1)) * h : h / 2);
  const names = useMemo(() => {
    const want = Math.max(4, Math.floor(h / 26));
    const picked = new Set<number>([0, stops.length - 1]);
    for (let k = 1; k < want; k++) {
      const target = Math.round((k * (stops.length - 1)) / want);
      picked.add([target, target - 1, target + 1, target - 2, target + 2].find(i => i > 0 && i < stops.length - 1 && isMajorStop(stops[i]?.name ?? '')) ?? target);
    }
    return [...picked].filter(i => i >= 0 && i < stops.length).sort((a, b) => a - b).filter((i, k, a) => k === 0 || y(i) - y(a[k - 1]) >= 18);
  }, [stops, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const ticks = Array.from({ length: WINDOW_H * 2 + 1 }, (_, k) => start + k * 0.5);
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const i = Math.max(0, Math.min(stops.length - 1, Math.round(((py - M.top) / h) * (stops.length - 1))));
    let best: { line: number; d: number } | null = null;
    visible.forEach((l, k) => { const p = l.pts.find(q => q.i === i); if (p) { const d = Math.abs(x(p.h) - px); if (d < 14 && (!best || d < best.d)) best = { line: k, d }; } });
    setHot(best ? { line: (best as { line: number }).line, stop: i } : null);
  };
  const hotLine = hot ? visible[hot.line] : null;
  const hotPt = hotLine && hot ? hotLine.pts.find(p => p.i === hot.stop) : null;
  const neutral = visible.map((l, k) => ({ l, k }));
  return (
    <section aria-label="String line" className={`${TILE} absolute inset-3 z-30 flex flex-col shadow-2xl`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="m-0 text-sm font-bold text-[var(--text-muted)]">String line <span className="font-normal">· {v3.directionLabels[String(dir)]}</span></h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex gap-1" role="group" aria-label="Day">
            {dates.map(d => <Pill key={d} size="segment" selected={d === date} onClick={() => setDate(d)}>{dateRangeText(d, d)}</Pill>)}
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Window">
            <Pill size="segment" aria-label="Earlier" onClick={() => setStart(s => s - 1)}>◀</Pill>
            <span className="min-w-[8.5rem] text-center text-xs font-bold tabular-nums">{clockAt(start)} – {clockAt(end)}</span>
            <Pill size="segment" aria-label="Later" onClick={() => setStart(s => s + 1)}>▶</Pill>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[var(--text-dim)] hover:text-[var(--text-primary)]"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div ref={box} className="mt-3 min-h-0 flex-1">
        {size.w > 0 && data && (
          <svg width={size.w} height={size.h} onPointerMove={move} onPointerLeave={() => setHot(null)} role="img" aria-label="String-line chart: each line is one vehicle trip, time across and stops down the route.">
            {names.map(i => <text key={i} x={M.left - 10} y={y(i) + 4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">{clip(shortStopName(titleCase(stops[i].name)), M.left === M_NARROW.left ? 13 : 30)}</text>)}
            {ticks.map(t => <text key={t} x={x(t)} y={size.h - 6} textAnchor="middle" fontSize={12} fill="var(--text-dim)">{clockAt(t)}</text>)}
            <g fill="none" strokeLinecap="round">
              {neutral.map(({ l, k }) => l.pts.slice(0, -1).map((p, n) => { const q = l.pts[n + 1]; return l.bunchedAt.has(p.i) ? null : <line key={`${l.id}-${k}-${n}`} x1={x(p.h)} y1={y(p.i)} x2={x(q.h)} y2={y(q.i)} stroke={hot?.line === k ? 'var(--accent)' : 'var(--text-primary)'} strokeOpacity={hot ? (hot.line === k ? 1 : 0.1) : 0.28} strokeWidth={hot?.line === k ? 2.5 : 1} />; }))}
              {neutral.map(({ l, k }) => l.pts.slice(0, -1).map((p, n) => { const q = l.pts[n + 1]; return l.bunchedAt.has(p.i) ? <line key={`b${l.id}-${k}-${n}`} x1={x(p.h)} y1={y(p.i)} x2={x(q.h)} y2={y(q.i)} stroke="var(--strip-bunching-2)" strokeOpacity={hot && hot.line !== k ? 0.15 : 1} strokeWidth={2} /> : null; }))}
            </g>
            {hotPt && (
              <g pointerEvents="none">
                <circle cx={x(hotPt.h)} cy={y(hotPt.i)} r={4} fill="var(--accent)" />
                <text x={Math.min(size.w - 64, x(hotPt.h) + 8)} y={y(hotPt.i) - 8} fontSize={12} fontWeight={700} fill="var(--text-primary)">{clockAt(hotPt.h)}</text>
              </g>
            )}
          </svg>
        )}
      </div>
    </section>
  );
}
