import type { Key, ReactNode } from 'react';

export interface DataTableColumn<T> {
  key: string;
  /** Header content; may hold a sort button. */
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Extra classes for this column's body cells. */
  className?: string;
  /** Render the body cells of this column as row headers (th scope="row"). */
  rowHeader?: boolean;
  /** Fixed layout only: width in rem. Defaults to FIXED_FIRST_COLUMN_REM for the first column, FIXED_COLUMN_REM for the rest. */
  width?: number;
  /** The header sorts the table (with the table's `sort` and `onSort`). */
  sortable?: boolean;
}

/** Which column the rows are sorted by. `reversed` is the second click: the table's own default order turned round. */
export interface DataTableSort {
  key: string;
  reversed: boolean;
}

/**
 * compact: small docs table, no row rules.
 * ruled: research table with a rule under the header and between rows.
 * card: dense diagnostics table inside a card, with row hover.
 */
const VARIANTS = {
  compact: {
    table: 'w-full text-left text-xs',
    thead: 'text-[var(--text-primary)]',
    headRow: '',
    th: 'py-1 font-bold',
    td: 'py-1',
    row: '',
    gap: true,
  },
  ruled: {
    table: 'w-full min-w-[34rem] text-left text-sm',
    thead: 'border-b border-[var(--border-primary)] text-xs text-[var(--text-dim)]',
    headRow: '',
    th: 'pb-3 font-black',
    td: 'py-4',
    row: 'border-b border-[var(--border-primary)] last:border-0',
    gap: true,
  },
  card: {
    table: 'w-full text-sm',
    thead: '',
    headRow: 'border-b border-[var(--border-primary)] text-left text-[var(--text-dim)]',
    th: 'px-4 py-3 font-medium whitespace-nowrap',
    td: 'px-4 py-2.5',
    row: 'border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)]/40 transition-colors',
    gap: false,
  },
} as const;

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => Key;
  variant?: keyof typeof VARIANTS;
  /** Screen-reader caption. */
  caption?: string;
  /**
   * Fixed column layout: the first column has one set width and every other column has the same set width, so
   * columns line up across tables and pages (agency and area pages). The table is only as wide as its columns and
   * leftover space stays empty on the right. Long text in the first column wraps.
   * Without it, each table sizes its columns to its own content.
   */
  fixed?: boolean;
  /**
   * Fixed layout that fills its container: the first column, and any column given a `width`, keep their set width; the
   * others share the rest equally, never narrower than the default width. For a page whose other blocks span the full content width.
   */
  fill?: boolean;
  /** Current sort, for the sortable columns' arrow and aria-sort. */
  sort?: DataTableSort;
  /** Called with a sortable column's key when its header is clicked (or Enter / Space on it). */
  onSort?: (key: string) => void;
}

/** Width of the first column in a fixed-layout table. One value for every table, so they all line up. */
export const FIXED_FIRST_COLUMN_REM = 16;
/** Width of every other column in a fixed-layout table. */
export const FIXED_COLUMN_REM = 8;

/** Plain data table. Wrap it in an overflow-x-auto element where it may be wider than its container. */
export default function DataTable<T>({ columns, rows, rowKey, variant = 'compact', caption, fixed = false, fill = false, sort, onSort }: DataTableProps<T>) {
  const v = VARIANTS[variant];
  const widths = columns.map((col, i) => col.width ?? (i === 0 ? FIXED_FIRST_COLUMN_REM : FIXED_COLUMN_REM));
  const pad = (i: number) => (v.gap && i < columns.length - 1 ? ' pr-4' : '');
  return (
    <table
      className={fixed ? `${v.table} table-fixed` : v.table}
      style={fixed ? (fill ? { width: '100%', minWidth: `${widths.reduce((a, b) => a + b, 0)}rem` } : { width: `${widths.reduce((a, b) => a + b, 0)}rem` }) : undefined}
    >
      {caption && <caption className="sr-only">{caption}</caption>}
      {fixed && (
        <colgroup>
          {columns.map((col, i) => <col key={col.key} style={fill && i > 0 && col.width == null ? undefined : { width: `${widths[i]}rem` }} />)}
        </colgroup>
      )}
      <thead className={v.thead}>
        <tr className={v.headRow}>
          {columns.map((col, i) => (
            col.sortable && onSort ? (
              <th key={col.key} scope="col" className={`${v.th}${pad(i)}`} aria-sort={sort?.key === col.key ? (sort.reversed ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => onSort(col.key)} className="inline-flex items-center gap-1 font-[inherit] hover:underline">
                  {col.header}
                  <span aria-hidden="true" className={`text-[0.7em] ${sort?.key === col.key ? '' : 'invisible'}`}>{sort?.key === col.key && sort.reversed ? '▲' : '▼'}</span>
                </button>
              </th>
            ) : <th key={col.key} scope="col" className={`${v.th}${pad(i)}`}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={rowKey(row)} className={v.row}>
            {columns.map((col, i) => {
              const className = `${v.td}${pad(i)}${fixed && i === 0 ? ' break-words' : ''}${col.className ? ` ${col.className}` : ''}`;
              return col.rowHeader
                ? <th key={col.key} scope="row" className={className}>{col.cell(row)}</th>
                : <td key={col.key} className={className}>{col.cell(row)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
