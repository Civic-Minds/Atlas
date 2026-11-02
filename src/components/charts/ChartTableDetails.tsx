import type { Key } from 'react';
import DataTable, { type DataTableColumn } from '../ui/DataTable';

/**
 * A research chart's own numbers as a table for screen readers, with no visible toggle (CIV-1281, Ryan): give the chart
 * `aria-details` this `id`, which points screen readers to the table without reading it all out as the chart's description.
 */
export default function ChartTableDetails<T>({ id, caption, columns, rows, rowKey }: { id: string; caption: string; columns: DataTableColumn<T>[]; rows: readonly T[]; rowKey: (row: T) => Key }) {
  return (
    <div id={id} className="sr-only">
      <DataTable variant="compact" layout="fixed" caption={caption} columns={columns} rows={rows} rowKey={rowKey} />
    </div>
  );
}
