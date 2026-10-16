import { useEffect, useMemo, useRef, useState } from 'react';
import { periodKeyForHour } from '../../../shared/config';
import type { DashboardBand } from '../../../shared/liveDashboard';
import { liveStringsDataUrl } from '../../lib/liveReportData';
import { isMajorStop, shortStopName } from '../../utils/stopLabel';
import { titleCase } from '../../utils/format';

/** One service day's per-trip stop times (scripts/live-segment-delay.ts --strings-dir). Times are seconds after `base` (epoch seconds). */
export interface StringsFile {
  schema: 1;
  date: string;
  base: number;
  timeZone: string;
  stops: Record<string, Array<{ stopId: string; name: string }>>;
  trips: Array<{ id: string; dir: number; /** [place along the main pattern, actual, timetable] */ s: Array<[number, number, number]> }>;
}

export type StringsState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; data: StringsFile };

export function useStrings(agency: string, route: string, date: string | null): StringsState {
  const [state, setState] = useState<StringsState>({ kind: 'loading' });
  useEffect(() => {
    if (!date) { setState({ kind: 'missing' }); return; }
    let live = true;
    setState({ kind: 'loading' });
    fetch(liveStringsDataUrl(agency, route, date))
      .then(r => (r.ok ? r.json() : null))
      .then((d: StringsFile | { noData: true } | null) => { if (live) setState(d && 'trips' in d ? { kind: 'ready', data: d } : { kind: 'missing' }); })
      .catch(() => { if (live) setState({ kind: 'missing' }); });
    return () => { live = false; };
  }, [agency, route, date]);
  return state;
}

const WIDE = { m: { left: 150, right: 20, top: 12, bottom: 28 }, h: 440 };
const SMALL = { m: { left: 8, right: 8, top: 6, bottom: 22 }, h: 250 };
export const clock = (h: number) => `${Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12}${Math.floor(h) % 24 < 12 ? ' am' : ' pm'}`;
export const clockAt = (h: number) => { const m = Math.round((h - Math.floor(h)) * 60); const hh = Math.floor(h) + (m === 60 ? 1 : 0); return `${hh % 12 === 0 ? 12 : hh % 12}:${String(m === 60 ? 0 : m).padStart(2, '0')} ${hh % 24 < 12 ? 'am' : 'pm'}`; };

/** Hours of the local service day for each trip point (can pass 24 after midnight). */
export function dayStartEpoch(base: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(base * 1000));
  const n = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  return base - ((n('hour') % 24) * 3600 + n('minute') * 60 + n('second'));
}

/**
 * Time runs left to right, the stops of the route top to bottom, and each vehicle trip is one line through the times it
 * left each stop. Vehicles that run evenly make parallel lines; bunched vehicles make lines that converge. Hover a line to
 * highlight that trip and read the time it left the stop under the pointer.
 */
export default function StringLine({ data, directionId, band, compact = false, className = '' }: { data: StringsFile; directionId: number; band: DashboardBand; /** A small chart for a widget: no stop names down the side. */ compact?: boolean; className?: string }) {
  const { m: M, h: H } = compact ? SMALL : WIDE;
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hot, setHot] = useState<{ trip: number; stop: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stops = data.stops[String(directionId)] ?? [];
  const day0 = useMemo(() => dayStartEpoch(data.base, data.timeZone), [data]);
  const trips = useMemo(() => data.trips.filter(t => t.dir === directionId).map(t => ({ id: t.id, pts: t.s.map(([i, a]) => ({ i, h: (data.base + a - day0) / 3600 })).sort((p, q) => p.i - q.i) })), [data, directionId, day0]);
  // The window: the whole service day, or the hours of the chosen time of day.
  const [h0, h1] = useMemo(() => {
    const all = trips.flatMap(t => t.pts.map(p => p.h));
    if (!all.length) return [5, 25] as const;
    let lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
    if (band !== 'all') {
      const hrs = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter(h => periodKeyForHour(h % 24) === band);
      if (hrs.length) { lo = Math.min(...hrs); hi = Math.max(...hrs) + 1; }
    }
    return [lo, Math.max(hi, lo + 1)] as const;
  }, [trips, band]);
  const w = Math.max(0, width - M.left - M.right), h = H - M.top - M.bottom;
  const x = (hour: number) => M.left + ((hour - h0) / (h1 - h0)) * w;
  const y = (i: number) => M.top + (stops.length > 1 ? (i / (stops.length - 1)) * h : h / 2);
  const hourTicks = Array.from({ length: h1 - h0 + 1 }, (_, k) => h0 + k).filter((_, k, a) => a.length <= 14 || k % 2 === 0);
  const yTicks = useMemo(() => {
    const want = Math.max(4, Math.floor(h / 40));
    const picked = new Set<number>([0, stops.length - 1]);
    for (let k = 1; k < want; k++) {
      const target = Math.round((k * (stops.length - 1)) / want);
      const near = [target, target - 1, target + 1, target - 2, target + 2].find(i => i > 0 && i < stops.length - 1 && isMajorStop(stops[i].name));
      picked.add(near ?? target);
    }
    return [...picked].filter(i => i >= 0 && [...picked].every(j => j === i || Math.abs(y(j) - y(i)) >= 18)).sort((a, b) => a - b);
  }, [stops, h]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = trips.filter(t => t.pts.some(p => p.h >= h0 && p.h <= h1));

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const i = Math.max(0, Math.min(stops.length - 1, Math.round(((py - M.top) / h) * (stops.length - 1))));
    let best: { trip: number; d: number } | null = null;
    visible.forEach((t, k) => { const p = t.pts.find(q => q.i === i); if (p) { const d = Math.abs(x(p.h) - px); if (d < 14 && (!best || d < best.d)) best = { trip: k, d }; } });
    setHot(best ? { trip: (best as { trip: number }).trip, stop: i } : null);
  };
  const hotTrip = hot ? visible[hot.trip] : null;
  const hotPt = hotTrip && hot ? hotTrip.pts.find(p => p.i === hot.stop) : null;
  return (
    <div ref={box} className={`relative w-full ${className}`.trim()}>
      {width > 0 && (
        <svg width={width} height={H} onPointerMove={move} onPointerLeave={() => setHot(null)} role="img" aria-label="String-line chart: each line is one vehicle trip, time across and stops down the route.">
          {!compact && yTicks.map(i => (
            <g key={i}>
              <line x1={M.left} x2={width - M.right} y1={y(i)} y2={y(i)} stroke="var(--border-primary)" strokeWidth={1} />
              <text x={M.left - 8} y={y(i) + 4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">{shortStopName(titleCase(stops[i].name))}</text>
            </g>
          ))}
          {hourTicks.filter((_, k) => !compact || k % 3 === 0).map(t => (
            <g key={t}>
              {!compact && <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="var(--border-primary)" strokeWidth={1} strokeDasharray="2 4" />}
              <text x={x(t)} y={H - 6} textAnchor="middle" fontSize={12} fill="var(--text-dim)">{clock(t)}</text>
            </g>
          ))}
          <g>
            {visible.map((t, k) => (
              <polyline key={`${t.id}-${k}`} fill="none" stroke={hot?.trip === k ? 'var(--accent)' : 'var(--text-primary)'} strokeOpacity={hot ? (hot.trip === k ? 1 : 0.12) : 0.32} strokeWidth={hot?.trip === k ? 2.5 : 1} points={t.pts.map(p => `${x(p.h).toFixed(1)},${y(p.i).toFixed(1)}`).join(' ')} />
            ))}
          </g>
          {hotPt && (
            <g pointerEvents="none">
              <circle cx={x(hotPt.h)} cy={y(hotPt.i)} r={4} fill="var(--accent)" />
              <text x={Math.min(width - 60, x(hotPt.h) + 8)} y={y(hotPt.i) - 8} fontSize={12} fontWeight={700} fill="var(--text-primary)">{clockAt(hotPt.h)}</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
