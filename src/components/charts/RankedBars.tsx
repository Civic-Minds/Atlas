import type { Key, ReactNode } from 'react';

/** One bar of a research bar chart: its name, its count and its fill. */
export interface RankedBar {
  key: Key;
  label: ReactNode;
  value: number;
  /** The bar's fill (a colour, or a pattern such as stripes for "not found"). */
  fill: string;
}

type Props = {
  bars: readonly RankedBar[];
  /** The value a full-width bar stands for (shared when two charts sit on one scale). */
  max: number;
  /** The bars' list spacing. */
  listClassName: string;
  /** Each row's grid: name, bar and count columns. */
  rowClassName: string;
  labelClassName: string;
  /** Extra classes on the fill (a transition, for bars that change). */
  fillClassName?: string;
} & (
  | {
      /** A read-only chart: a list whose rows name their count on hover. */
      as: 'list';
      title: (bar: RankedBar) => string;
    }
  | {
      /** A chart whose bars are picked one at a time. */
      as: 'buttons';
      selectedKey: Key;
      onSelect: (key: Key) => void;
      /** The button's accessible name and hover text. */
      describe: (bar: RankedBar) => string;
    }
);

/**
 * The research pages' bar chart (Free child fares, the Frequent service story): a name, a rounded bar on a shared track
 * and the count, one row per bar. One component for both charts, so their bars look and read the same.
 */
export default function RankedBars(props: Props) {
  const { bars, max, listClassName, rowClassName, labelClassName, fillClassName } = props;
  const cells = (bar: RankedBar) => (
    <>
      <span className={labelClassName}>{bar.label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]">
        <div
          className={`h-full rounded-full${fillClassName ? ` ${fillClassName}` : ''}`}
          style={props.as === 'buttons'
            ? { width: `${(bar.value / max) * 100}%`, backgroundColor: bar.fill }
            : { width: `${(bar.value / max) * 100}%`, background: bar.fill }}
        />
      </div>
      <span className="text-right tabular-nums text-[var(--text-muted)]">{bar.value}</span>
    </>
  );
  if (props.as === 'list') {
    return (
      <ul className={listClassName}>
        {bars.map(bar => (
          <li key={bar.key} title={props.title(bar)} className={rowClassName}>{cells(bar)}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className={listClassName}>
      {bars.map(bar => (
        <button
          key={bar.key}
          type="button"
          aria-pressed={props.selectedKey === bar.key}
          aria-label={props.describe(bar)}
          onClick={() => props.onSelect(bar.key)}
          title={props.describe(bar)}
          className={rowClassName}
        >
          {cells(bar)}
        </button>
      ))}
    </div>
  );
}
