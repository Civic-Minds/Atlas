import type { Key } from 'react';
import { ChevronDown } from 'lucide-react';
import DataTable, { type DataTableColumn } from '../ui/DataTable';

/** "Show as a table" under a research chart: the chart's own numbers as a table, closed until opened. */
export default function ChartTableDetails<T>({ caption, columns, rows, rowKey }: { caption: string; columns: DataTableColumn<T>[]; rows: readonly T[]; rowKey: (row: T) => Key }) {
  return (
    <details className="group mt-5">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
        Show as a table
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="mt-3 overflow-x-auto">
        <DataTable variant="compact" layout="fixed" caption={caption} columns={columns} rows={rows} rowKey={rowKey} />
      </div>
    </details>
  );
}
