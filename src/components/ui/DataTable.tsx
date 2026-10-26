import type { CSSProperties, Key, MouseEvent, ReactNode } from 'react';

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
  /** With `narrowFit`: leave this column out below the sm breakpoint (its figure can go in `rowTitle`). */
  narrowHide?: boolean;
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
  /**
   * Phone widths (below sm): no minimum width, columns size to their content and the ones marked `narrowHide` are left
   * out, so the table fits its container without scrolling. From sm up it is the fixed layout as before. Needs `fill`.
   */
  narrowFit?: boolean;
  /**
   * Fixed layout that fills its container with the other columns at its right edge: they keep their set width and are
   * right-aligned, and the first column takes what is left, so the last column lines up with links at the right of the
   * section (area and agency pages, CIV-958). Below the set widths the table scrolls in its wrapper as before. On phones
   * (below sm) it is the plain fixed layout instead: default widths, left-aligned, columns right after the first, so a
   * column cut off at the edge shows there is more to scroll to (CIV-973). Headers sit on their bottom line.
   */
  endAligned?: boolean;
  /**
   * The whole row opens this page: it highlights on hover like a card list row and a click anywhere follows it. The
   * first and last cells get a little inner space for the highlight; give the wrapper `-mx-2` to keep the text in line.
   */
  rowHref?: (row: T) => string;
  /** Hover text for a whole row (where a column was left out on a phone, its figure). */
  rowTitle?: (row: T) => string | undefined;
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
/**
 * A click anywhere on a linked row follows its link, and a middle, Cmd or Ctrl click opens it in a new tab. A click on a
 * link or button inside keeps its own behaviour, and so does selecting text in the row.
 */
function openRow(e: MouseEvent<HTMLTableRowElement>, href: string) {
  if ((e.target as HTMLElement).closest('a, button') || window.getSelection()?.toString()) return;
  if (e.button === 1 || e.metaKey || e.ctrlKey) window.open(href, '_blank', 'noopener');
  else if (e.button === 0) window.location.assign(href);
}

export default function DataTable<T>({ columns, rows, rowKey, variant = 'compact', caption, fixed = false, fill = false, narrowFit = false, endAligned = false, rowHref, rowTitle, sort, onSort }: DataTableProps<T>) {
  const v = VARIANTS[variant];
  const widths = columns.map((col, i) => col.width ?? (i === 0 ? FIXED_FIRST_COLUMN_REM : FIXED_COLUMN_REM));
  const fit = fixed && fill && narrowFit;
  const shown = columns.map(c => !(fit && c.narrowHide));
  // The last column drawn on a phone carries no gap on its right.
  const lastNarrow = shown.lastIndexOf(true);
  const pad = (i: number) => (v.gap && i < columns.length - 1 ? (fit && i !== lastNarrow ? ' pr-3 sm:pr-4' : fit ? ' pr-0 sm:pr-4' : ' pr-4') : '');
  const hide = (i: number) => (fit && columns[i].narrowHide ? ' max-sm:hidden' : '');
  const end = fixed && endAligned;
  // From sm up, right-aligned columns take their gap on the left; the last one has none on the right, so it meets the edge.
  const cellPad = (i: number) => (end ? (i === 0 ? ' pr-4' : `${i < columns.length - 1 ? ' pr-4' : ''} sm:pr-0 sm:pl-2 sm:text-right`) : pad(i));
  // Phones: the default fixed widths, whatever the columns ask for from sm up.
  const phoneWidths = columns.map((_, i) => (i === 0 ? FIXED_FIRST_COLUMN_REM : FIXED_COLUMN_REM));
  // A linked row's highlight reaches a little past the text on both sides, as in card lists.
  const rowEdge = (i: number) => (rowHref ? (i === 0 ? ' pl-2' : '') + (i === columns.length - 1 ? ' pr-2' : '') : '');
  const totalRem = widths.reduce((a, b) => a + b, 0);
  return (
    <table
      className={fixed ? `${v.table} ${fit ? 'sm:table-fixed sm:min-w-[var(--table-min)]' : 'table-fixed'}${end ? ' max-sm:!w-[var(--table-w)] sm:min-w-[var(--table-min)]' : ''}` : v.table}
      style={end ? ({ width: '100%', '--table-w': `${phoneWidths.reduce((a, b) => a + b, 0)}rem`, '--table-min': `${totalRem}rem` } as CSSProperties) : fixed ? (fill ? (fit ? ({ width: '100%', '--table-min': `${widths.reduce((a, b) => a + b, 0)}rem` } as CSSProperties) : { width: '100%', minWidth: `${widths.reduce((a, b) => a + b, 0)}rem` }) : { width: `${widths.reduce((a, b) => a + b, 0)}rem` }) : undefined}
    >
      {caption && <caption className="sr-only">{caption}</caption>}
      {fixed && (
        <colgroup>
          {columns.map((col, i) => fit
            ? <col key={col.key} className={`${fill && i > 0 && col.width == null ? '' : 'sm:w-[var(--col-w)]'}${hide(i)}`} style={{ '--col-w': `${widths[i]}rem` } as CSSProperties} />
            : end
              ? <col key={col.key} className={`w-[var(--col-phone)] ${i > 0 ? 'sm:w-[var(--col-w)]' : 'sm:w-auto'}`} style={{ '--col-phone': `${phoneWidths[i]}rem`, '--col-w': `${widths[i]}rem` } as CSSProperties} />
              : <col key={col.key} style={fill && i > 0 && col.width == null ? undefined : { width: `${widths[i]}rem` }} />)}
        </colgroup>
      )}
      <thead className={v.thead}>
        <tr className={v.headRow}>
          {columns.map((col, i) => (
            col.sortable && onSort ? (
              <th key={col.key} scope="col" className={`${v.th}${cellPad(i)}${rowEdge(i)}${hide(i)}${end ? ' align-bottom' : ''}`} aria-sort={sort?.key === col.key ? (sort.reversed ? 'ascending' : 'descending') : 'none'}>
                <button type="button" onClick={() => onSort(col.key)} className="inline-flex items-center gap-1 font-[inherit] hover:underline">
                  {col.header}
                  <span aria-hidden="true" className={`text-[0.7em] ${sort?.key === col.key ? '' : 'invisible'}`}>{sort?.key === col.key && sort.reversed ? '▲' : '▼'}</span>
                </button>
              </th>
            ) : <th key={col.key} scope="col" className={`${v.th}${cellPad(i)}${rowEdge(i)}${hide(i)}${end ? ' align-bottom' : ''}`}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={rowKey(row)}
            className={`${v.row}${rowHref ? ' cursor-pointer hover:bg-[var(--bg-btn-hover)] transition-colors' : ''}`}
            title={rowTitle?.(row)}
            onClick={rowHref ? e => openRow(e, rowHref(row)) : undefined}
            onAuxClick={rowHref ? e => openRow(e, rowHref(row)) : undefined}
          >
            {columns.map((col, i) => {
              const className = `${v.td}${cellPad(i)}${rowEdge(i)}${hide(i)}${fixed && i === 0 ? ' break-words' : ''}${col.className ? ` ${col.className}` : ''}`;
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
