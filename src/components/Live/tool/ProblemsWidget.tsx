import Widget from './Widget';

export interface Problem { key: string; label: string; sub?: string; value: string; onPick: () => void }

/** A short clickable list of the worst places (stops), each with its figure; a click selects it on the map. */
export default function ProblemsWidget({ title, rows, intro }: { title: string; rows: readonly Problem[]; /** A line under the title that says how the list is picked. */ intro?: string }) {
  if (!rows.length) return null;
  return (
    <Widget title={title} size="medium">
      {intro && <p className="m-0 mb-1 text-xs leading-4 text-[var(--text-dim)]">{intro}</p>}
      <ul className="m-0 p-0">
        {rows.map(r => (
          <li key={r.key} className="list-none">
            <button type="button" onClick={r.onPick} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-1.5 py-1 text-left text-sm hover:bg-[var(--bg-hover)]">
              <span className="min-w-0 break-words">{r.label}{r.sub && <span className="text-[var(--text-dim)]"> {r.sub}</span>}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">{r.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </Widget>
  );
}
