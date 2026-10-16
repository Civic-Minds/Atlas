import { useId } from 'react';
import { SPARKLINE_HOURS, SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import DataTable from '../ui/DataTable';

export interface HourColumn {
  /** Hour of day, 0-23. */
  hour: number;
  n: number;
  /** Shares of n, bottom to top; they add up to 1. */
  parts: readonly number[];
}

export interface HourPart {
  name: string;
  /** CSS colour (a token). */
  color: string;
}

const H = 96;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 < 12 ? 'am' : 'pm'}`;

/**
 * A bar for each hour of the day, in the same shape as the route card's schedule sparkline: same hour order, narrow
 * rounded bars, 90% opacity, a faded bar where there are too few departures, and the same axis labels (6a, 12p, 6p, 12a).
 * Each bar splits into shares (for example ahead / on time / late) with a small gap between them. The numbers are also
 * in a table for screen readers.
 */
export default function HourBars({ columns, parts, ariaLabel, minN = 30 }: { columns: readonly HourColumn[]; parts: readonly HourPart[]; ariaLabel: string; minN?: number }) {
  const tableId = useId();
  const byHour = new Map(columns.map(c => [c.hour, c]));
  const text = (c: HourColumn) => `${clock(c.hour)}: ${c.parts.map((p, i) => `${parts[i].name} ${Math.round(p * 100)}%`).join(', ')} (${c.n.toLocaleString()} departures)`;
  const ordered = SPARKLINE_HOURS.map(h => byHour.get(h % 24)).filter((c): c is HourColumn => !!c);
  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel} tabIndex={0} aria-describedby={tableId}>
        <div aria-hidden="true">
        <div className="flex items-end gap-px" style={{ height: H }}>
          {SPARKLINE_HOURS.map(gtfsHour => {
            const c = byHour.get(gtfsHour % 24);
            const enough = !!c && c.n >= minN;
            return (
              <div key={gtfsHour} className="flex h-full min-w-0 flex-1 items-end justify-center" title={c ? text(c) : undefined}>
                {c && (
                  <div className={`flex w-[60%] max-w-[14px] min-w-[3px] flex-col-reverse gap-[2px] overflow-hidden rounded-sm ${enough ? 'opacity-90' : 'opacity-40'}`} style={{ height: H }}>
                    {c.parts.map((share, i) => share > 0 ? <div key={parts[i].name} style={{ flex: `${share} 1 0`, background: parts[i].color }} /> : null)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-px">
          {SPARKLINE_HOURS.map(h => (
            <div key={h} className="min-w-0 flex-1 text-center"><span className="text-xs text-[var(--text-dim)]">{SPARKLINE_HOUR_LABELS[h]}</span></div>
          ))}
        </div>
        </div>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--text-dim)]">
        <span className="font-normal">Paler bars rest on fewer than {minN} departures.</span>
        {parts.map(p => <span key={p.name} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden="true" />{p.name}</span>)}
      </figcaption>
      {/* The numbers behind the chart, for screen readers only: linked to the chart by aria-describedby. */}
      <div id={tableId} className="sr-only">
        <div>
          <DataTable
            fixed
            caption={ariaLabel}
            rows={ordered}
            rowKey={c => c.hour}
            columns={[
              { key: 'hour', header: 'Hour', rowHeader: true, className: 'font-normal', cell: c => clock(c.hour) },
              ...parts.map((p, i) => ({ key: p.name, header: p.name, cell: (c: HourColumn) => `${Math.round(c.parts[i] * 100)}%` })),
              { key: 'n', header: 'Departures', cell: c => c.n.toLocaleString() },
            ]}
          />
        </div>
      </div>
    </figure>
  );
}
