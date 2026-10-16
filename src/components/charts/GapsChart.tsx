import { SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import { BUNCHED_GAP_SEC, GAPPED_FACTOR } from '../../../shared/bunching';
import { liveChartHours } from '../../utils/sparklinePeriods';
import type { StopGaps } from '../../hooks/useLiveGaps';
import LegendItem from '../ui/LegendItem';
import { useWidth } from './RunTimeChart';

const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const AXIS_W = 40;
const PAD_RIGHT = 8;
/** An hour is on the axis when it has at least this many gaps. */
const MIN_HOUR_GAPS = 10;

/** The strip's three bunching steps, per gap: bunched (under 2 min), near the timetable, or over twice the scheduled gap. */
export function gapStep(gapSec: number, scheduledSec: number): 0 | 1 | 2 {
  if (gapSec < BUNCHED_GAP_SEC) return 2;
  if (scheduledSec > 0 && gapSec > GAPPED_FACTOR * scheduledSec) return 1;
  return 0;
}
const STEP_COLOR = ['var(--strip-bunching-0)', 'var(--strip-bunching-1)', 'var(--strip-bunching-2)'] as const;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * Every gap between consecutive cars at one stop over the week: a dot per gap at the time of day the later car passed,
 * its height the gap in minutes, coloured with the route strip's bunching steps, over the timetable's gap for each hour
 * (dashed). The hour axis follows the other Live hour charts.
 */
export default function GapsChart({ gaps, ariaLabel, height: H = 220 }: { gaps: StopGaps; ariaLabel: string; height?: number }) {
  const [ref, width] = useWidth();
  const perHour = new Map<number, number>();
  for (const m of gaps.m) { const h = Math.floor(m / 60) % 24; perHour.set(h, (perHour.get(h) ?? 0) + 1); }
  const axis = liveChartHours(h => (perHour.get(h) ?? 0) >= MIN_HOUR_GAPS);
  if (!axis.length) return null;
  const x0 = axis[0] * 60, x1 = (axis[axis.length - 1] + 1) * 60;
  const plotW = Math.max(0, width - AXIS_W - PAD_RIGHT);
  const x = (m: number) => AXIS_W + ((m - x0) / (x1 - x0)) * plotW;
  // Headroom for the long gaps without letting one outlier flatten the rest: 3x the typical timetable gap, at least 10 min.
  const yMax = Math.max(10, Math.ceil((3 * median(gaps.s)) / 60 / 5) * 5);
  const y = (min: number) => PAD_TOP + (1 - Math.min(min, yMax) / yMax) * (H - PAD_TOP - PAD_BOTTOM);
  const step = yMax > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);
  // The timetable's gap for each hour on the axis (median of the scheduled gaps of the gaps measured in that hour).
  const sched = axis.map(h => {
    const s = gaps.s.filter((_, i) => Math.floor(gaps.m[i] / 60) === h);
    return { h, min: s.length ? median(s) / 60 : null };
  });
  const schedPath = sched.filter(p => p.min != null).map((p, k) => `${k ? 'L' : 'M'}${x(p.h * 60)},${y(p.min!)}H${x((p.h + 1) * 60)}`).join('');
  const dots = gaps.m.map((m, i) => ({ m, min: gaps.g[i] / 60, step: gapStep(gaps.g[i], gaps.s[i]) })).filter(d => d.m >= x0 && d.m < x1);
  return (
    <figure className="m-0">
      <div ref={ref} role="img" aria-label={ariaLabel}>
        {width > 0 && (
          <svg width={width} height={H} aria-hidden="true" className="block">
            {ticks.map(t => (
              <g key={t}>
                <line x1={AXIS_W} x2={AXIS_W + plotW} y1={y(t)} y2={y(t)} stroke="var(--border-primary)" strokeWidth={1} />
                <text x={AXIS_W - 6} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--text-dim)">{t}</text>
              </g>
            ))}
            <text x={0} y={10} fontSize={13} fill="var(--text-dim)">min</text>
            {/* Near-timetable gaps first, so the bunched and long ones sit on top. */}
            {[0, 1, 2].map(s => dots.filter(d => d.step === s).map((d, k) => (
              <circle key={`${s}-${k}`} cx={x(d.m)} cy={y(d.min)} r={2} fill={STEP_COLOR[s]} opacity={s ? 0.75 : 0.45} />
            )))}
            <path d={schedPath} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />
            {axis.map(h => SPARKLINE_HOUR_LABELS[h] && (
              <text key={h} x={x(h * 60)} y={H - 4} textAnchor="middle" fontSize={13} fill="var(--text-dim)">{SPARKLINE_HOUR_LABELS[h]}</text>
            ))}
          </svg>
        )}
        {width === 0 && <div style={{ height: H }} />}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        <LegendItem color={STEP_COLOR[2]}>Too close together</LegendItem>
        <LegendItem color={STEP_COLOR[0]}>Near the timetable</LegendItem>
        <LegendItem color={STEP_COLOR[1]}>Too far apart</LegendItem>
        <span className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden="true"><line x1="0" x2="14" y1="2" y2="2" stroke="var(--text-secondary)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>Scheduled</span>
      </div>
    </figure>
  );
}
