import { useId, type Key } from 'react';
import DataTable from '../ui/DataTable';
import { niceAxis } from './ProfileBars';
import { useWidth } from './RunTimeChart';
import { AXIS_W } from './sparkParts';
import { CHART_COUNT, CHART_TEXT, FADED_OPACITY, useActivePart } from './useActivePart';

/** One dot: a thing with two measures. */
export interface ScatterPoint {
  key: Key;
  /** Its name, as the dot's accessible name and the table's first column. */
  label: string;
  x: number;
  y: number;
  /** What the dot says, as one sentence (hover line and screen readers). */
  sentence: string;
}

const PAD = { top: 24, right: 12, bottom: 34, left: AXIS_W };

/**
 * A scatter plot in the chart collection's look (CIV-1915, CIV-1173): faint gridlines, grey axis text at 12px, dots with a
 * halo on the panel colour. Each dot is focusable and says what it is on hover, focus or tap (the shared `useActivePart`
 * way: the others fade). The same figures are in a table for screen readers. Axis titles and number formats come from the caller.
 */
export default function ScatterPlot({ points, label, xTitle, yTitle, formatX, formatY, height = 280, xMin, yMin }: {
  points: readonly ScatterPoint[];
  /** What the chart shows, as its accessible name and the table's caption. */
  label: string;
  xTitle: string;
  yTitle: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  height?: number;
  /** Axis starts, when not the data's own minimum (0 for shares). */
  xMin?: number;
  yMin?: number;
}) {
  const tableId = useId();
  const part = useActivePart();
  const [ref, width] = useWidth();
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xa = niceAxis(xMin ?? Math.min(...xs), Math.max(...xs));
  const ya = niceAxis(yMin ?? Math.min(...ys), Math.max(...ys));
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const px = (v: number) => PAD.left + ((v - xa.min) / (xa.max - xa.min || 1)) * plotW;
  const py = (v: number) => PAD.top + (1 - (v - ya.min) / (ya.max - ya.min || 1)) * plotH;
  const shown = points.find(p => p.key === part.active);
  return (
    <figure className="m-0">
      <div className={`h-5 truncate ${CHART_TEXT}`} aria-hidden="true">
        {shown && <><span className={CHART_COUNT}>{shown.label}</span> {shown.sentence}</>}
      </div>
      <div ref={ref} role="group" aria-label={label} aria-describedby={tableId} onMouseLeave={part.clear}>
        {width > 0 && points.length > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            {ya.ticks.map(t => (
              <g key={`y${t}`} aria-hidden="true">
                <line x1={PAD.left} x2={PAD.left + plotW} y1={py(t)} y2={py(t)} stroke="var(--border-primary)" strokeWidth={1} opacity={0.7} />
                <text x={PAD.left - 6} y={py(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-dim)">{formatY(t)}</text>
              </g>
            ))}
            {xa.ticks.map(t => (
              <text key={`x${t}`} x={px(t)} y={height - 16} textAnchor="middle" fontSize={12} fill="var(--text-dim)" aria-hidden="true">{formatX(t)}</text>
            ))}
            <text x={PAD.left + plotW / 2} y={height - 2} textAnchor="middle" fontSize={12} fill="var(--text-dim)" aria-hidden="true">{xTitle}</text>
            <text x={0} y={10} fontSize={12} fill="var(--text-dim)" aria-hidden="true">{yTitle}</text>
            {points.map(p => (
              <circle
                key={p.key} cx={px(p.x)} cy={py(p.y)} r={5} tabIndex={0} role="img" aria-label={`${p.label}: ${p.sentence}`}
                fill="var(--text-primary)" stroke="var(--bg-panel)" strokeWidth={1.5}
                opacity={part.faded(p.key) ? FADED_OPACITY : 1} className="transition-opacity outline-none focus-visible:stroke-[var(--accent)]"
                {...part.partEvents(p.key)}
              />
            ))}
          </svg>
        )}
        {width === 0 && <div style={{ height }} />}
      </div>
      <div id={tableId} className="sr-only">
        <DataTable
          caption={label}
          rows={[...points]}
          rowKey={p => p.key}
          columns={[
            { key: 'label', header: '', rowHeader: true, className: 'font-normal', cell: p => p.label },
            { key: 'x', header: xTitle, cell: p => formatX(p.x) },
            { key: 'y', header: yTitle, cell: p => formatY(p.y) },
          ]}
        />
      </div>
    </figure>
  );
}
