import type { ReactNode } from 'react';
import Card from '../ui/Card';

/**
 * CIV-2003: the week table's card, one source for every small figures table on Live's panels: the week comparison
 * (WeekTable), Studio's Right now and its planner cut-offs. A surface card holding a DataTable, with the classes its
 * columns use and the small footnotes under it, so the three never drift apart.
 */

/** The first column's header (what the rows cover, "510 · both directions"). */
export const FIGURE_SCOPE_HEAD = 'font-bold text-[var(--text-primary)]';
/** A figure column's header ("This week"). */
export const FIGURE_HEAD = 'block text-right font-normal text-[var(--text-dim)]';
/** The row-name column's header when it only names the rows ("Direction"). */
export const FIGURE_ROW_HEAD = 'font-normal text-[var(--text-dim)]';
/** A row's name (the row header cell). */
export const FIGURE_ROW_LABEL = 'font-bold text-[var(--text-muted)]';
/** The main figure, bold. */
export const FIGURE_MAIN = 'text-right text-sm font-black tracking-tight';
/** The figure it is compared with, muted. */
export const FIGURE_OTHER = 'text-right text-sm text-[var(--text-muted)]';
const FOOTNOTE = 'text-xs leading-4 text-[var(--text-dim)] opacity-75';
const RULED = 'mt-1 border-t border-[var(--border-primary)] pt-1';

/** The card. `title` is a heading above the table, for a table whose first column is not its subject (Right now). */
export function FiguresCard({ label, title, children }: { label: string; title?: ReactNode; children: ReactNode }) {
  return (
    <Card as="section" tone="surface" aria-label={label} className="min-w-0 px-2.5 py-1.5">
      {title && <h3 className="m-0 pt-0.5 text-sm font-bold text-[var(--text-primary)]">{title}</h3>}
      {children}
    </Card>
  );
}

/** One footnote line under the table; `ruled` puts the thin rule above it (the first footnote). */
export function FigureFootnote({ ruled = false, title, children }: { ruled?: boolean; title?: string; children: ReactNode }) {
  return <p className={`m-0 ${ruled ? RULED : 'mt-0.5'} ${FOOTNOTE}`} title={title}>{children}</p>;
}

/** Footnote lines as a list; `tone="secondary"` for facts about the figures rather than how they are worked out. */
export function FigureNotes({ lines, ruled = true, tone = 'dim' }: { lines: readonly string[]; ruled?: boolean; tone?: 'dim' | 'secondary' }) {
  const li = tone === 'dim' ? FOOTNOTE : 'text-xs leading-4 text-[var(--text-secondary)]';
  return (
    <ul className={`m-0 list-none p-0 text-pretty ${ruled ? RULED : 'mt-0.5'}`}>
      {lines.map(n => <li key={n} className={li}>{n}</li>)}
    </ul>
  );
}
