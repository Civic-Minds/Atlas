import { useId, useState } from 'react';
import DataTable from '../ui/DataTable';
import LegendItem from '../ui/LegendItem';
import { niceAxis } from './ProfileBars';
import { useElementWidth } from '../../hooks/useElementWidth';
import { AXIS_W } from './sparkParts';
import { CHART_COUNT, CHART_TEXT } from './useActivePart';

/** One dot on the line: a value at a place along the x axis. */
export interface LinePoint {
  /** Where it sits along x (a year, a position from 0 to 1, a minute). Points are drawn in x order. */
  x: number;
  y: number;
  /** Its name on the axis, hover line and table ("2019"). */
  label: string;
  /** What the point says, as one sentence (hover line and screen readers). */
  sentence: string;
}

const PAD = { top: 24, right: 12, bottom: 24, left: AXIS_W };

/**
 * The main line's colour, and a second line's (CIV-2944: two measures on one chart, told apart by a key). Ryan, 2026-11-25:
 * "can the line colours not be the same": the second line takes the app's brand colour, not a second grey.
 */
const LINE_COLOR = 'var(--text-primary)';
const SECOND_LINE_COLOR = 'var(--color-brand)';

/** A second line on the same axes: one value per main point (same order), and its name in the key and table. */
export interface SecondLine {
  name: string;
  values: ReadonlyArray<number | null>;
}

/**
 * A line chart in the chart collection's look (CIV-1915, CIV-1173): faint gridlines, grey 12px axis text, a solid line with
 * dots that carry a halo on the panel colour, and the hover column the run-time chart uses. One focusable unit with a summary
 * label; each point's sentence shows on hover and the figures are in a table for screen readers. A gap in the data (`null`
 * between two points) breaks the line rather than joining them. Number formats and the axis title come from the caller.
 */
export default function LineChart({ points, label, yTitle, formatY, height = 240, yMin, xTickLabels, name, second }: {
  /** In x order; a `null` breaks the line there. */
  points: ReadonlyArray<LinePoint | null>;
  label: string;
  yTitle: string;
  formatY: (value: number) => string;
  height?: number;
  yMin?: number;
  /** The x axis's labels: which points get their label drawn (default: every one, so pass fewer for a long line). */
  xTickLabels?: (p: LinePoint, index: number) => boolean;
  /** The main line's name in the key; with `second`, a key above the chart names both lines. */
  name?: string;
  second?: SecondLine;
}) {
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useElementWidth();
  const real = points.filter((p): p is LinePoint => p != null);
  if (real.length === 0) return null;
  // The second line's value for each drawn point, by the point's place in `points`.
  const secondOf = new Map<LinePoint, number>();
  if (second) points.forEach((p, i) => { const v = second.values[i]; if (p != null && v != null) secondOf.set(p, v); });
  const xs = real.map(p => p.x), ys = [...real.map(p => p.y), ...secondOf.values()];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ya = niceAxis(yMin ?? Math.min(...ys), Math.max(...ys));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const px = (v: number) => PAD.left + (x1 > x0 ? ((v - x0) / (x1 - x0)) * plotW : plotW / 2);
  const py = (v: number) => PAD.top + (1 - (v - ya.min) / (ya.max - ya.min || 1)) * plotH;
  const runs: LinePoint[][] = [];
  for (const p of points) {
    if (p == null) { runs.push([]); continue; }
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push(p);
  }
  const shown = hover != null ? real[hover] : null;
  const colW = real.length > 1 ? plotW / (real.length - 1) : plotW;
  const showTick = xTickLabels ?? (() => true);
  return (
    <figure className="m-0">
      {second && name && (
        <div className={`mb-2 flex flex-wrap gap-x-4 gap-y-1 ${CHART_TEXT}`} aria-hidden="true">
          <LegendItem kind="line" color={LINE_COLOR}>{name}</LegendItem>
          <LegendItem kind="line" color={SECOND_LINE_COLOR}>{second.name}</LegendItem>
        </div>
      )}
      <div className={`h-5 truncate ${CHART_TEXT}`} aria-hidden="true">
        {shown && <><span className={CHART_COUNT}>{shown.label}</span> {shown.sentence}</>}
      </div>
      <div ref={ref} role="img" aria-label={label} aria-describedby={tableId} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true" className="block overflow-visible" onPointerLeave={() => setHover(null)}>
            {hover != null && shown && <rect x={px(shown.x) - colW / 2} y={PAD.top - 6} width={colW} height={plotH + 6} rx={3} fill="var(--bg-btn-hover)" />}
            {ya.ticks.map(t => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={py(t)} y2={py(t)} stroke="var(--border-primary)" strokeWidth={1} opacity={0.7} />
                <text x={PAD.left - 6} y={py(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-dim)">{formatY(t)}</text>
              </g>
            ))}
            <text x={0} y={10} fontSize={12} fill="var(--text-dim)">{yTitle}</text>
            {second && runs.map((r, k) => {
              const pts = r.filter(p => secondOf.has(p));
              return pts.length > 1 && <path key={`s${k}`} d={pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(secondOf.get(p)!)}`).join('')} fill="none" stroke={SECOND_LINE_COLOR} strokeWidth={2} strokeLinejoin="round" />;
            })}
            {real.map((p, i) => secondOf.has(p) && <circle key={`s${i}`} cx={px(p.x)} cy={py(secondOf.get(p)!)} r={3.5} fill={SECOND_LINE_COLOR} stroke="var(--bg-panel)" strokeWidth={1.5} />)}
            {runs.map((r, k) => r.length > 1 && (
              <path key={k} d={r.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)},${py(p.y)}`).join('')} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {real.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3.5} fill={LINE_COLOR} stroke="var(--bg-panel)" strokeWidth={1.5} />)}
            {real.map((p, i) => showTick(p, i) && (
              <text key={`t${i}`} x={px(p.x)} y={height - 4} textAnchor="middle" fontSize={12} fill="var(--text-dim)">{p.label}</text>
            ))}
            {real.map((p, i) => (
              <rect key={`hit${i}`} x={px(p.x) - colW / 2} y={PAD.top} width={colW} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            ))}
          </svg>
        )}
        {width === 0 && <div style={{ height }} />}
      </div>
      <div id={tableId} className="sr-only">
        <DataTable
          caption={label}
          rows={real}
          rowKey={p => p.label}
          columns={[
            { key: 'label', header: '', rowHeader: true, className: 'font-normal', cell: p => p.label },
            { key: 'y', header: second && name ? name : yTitle, cell: p => formatY(p.y) },
            ...(second ? [{ key: 'second', header: second.name, cell: (p: LinePoint) => { const v = secondOf.get(p); return v == null ? '' : formatY(v); } }] : []),
          ]}
        />
      </div>
    </figure>
  );
}
