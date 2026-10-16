import { useState, type Key } from 'react';
import DataTable, { type DataTableColumn } from './DataTable';

export interface SortableColumn<T> extends DataTableColumn<T> {
  /** Makes the header sort the rows: higher values are worse and come first; a second click turns the order round. */
  worst?: (row: T) => number | null | undefined;
}

/**
 * A DataTable that sorts itself by its headers (columns with `worst`), worst first, in the fixed full-width layout the
 * Live pages use. Ties keep the incoming order. For a table whose sort lives in the address, use DataTable's
 * `sort` / `onSort` directly (the Live agency Routes table).
 */
export default function SortableDataTable<T>({ columns, rows, defaultSort, ...rest }: {
  columns: SortableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => Key;
  caption?: string;
  /** The column the rows start sorted by; omit to keep the incoming order until a header is clicked. */
  defaultSort?: string;
}) {
  const [sort, setSort] = useState<{ key: string; reversed: boolean } | null>(defaultSort ? { key: defaultSort, reversed: false } : null);
  const col = sort ? columns.find(c => c.key === sort.key && c.worst) : undefined;
  const value = (r: T) => col?.worst?.(r) ?? -Infinity;
  const sorted = col
    ? rows.map((r, i) => ({ r, i })).sort((a, b) => (sort!.reversed ? -1 : 1) * (value(b.r) - value(a.r)) || a.i - b.i).map(x => x.r)
    : rows;
  return (
    <DataTable
      {...rest}
      fixed
      fill
      rows={sorted}
      // Headers stay on one line, as in the Routes table.
      columns={columns.map(({ worst, ...c }) => ({ ...c, header: <span className="whitespace-nowrap">{c.header}</span>, sortable: !!worst }))}
      sort={sort ?? undefined}
      onSort={key => setSort(s => (s?.key === key ? { key, reversed: !s.reversed } : { key, reversed: false }))}
    />
  );
}
