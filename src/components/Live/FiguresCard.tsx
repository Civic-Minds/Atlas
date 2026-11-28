import { CARD_NOTICE } from '../../styles';
import type { ReactNode } from 'react';
import Card from '../ui/Card';
import { PanelSection, usePanelSections } from './panelSections';

/**
 * CIV-2003: the week table's card, one source for every small figures table on Live's panels: the week comparison
 * (WeekTable), Studio's Right now and its planner cut-offs. A surface card holding a DataTable, with the classes its
 * columns use and the small footnotes under it, so the three never drift apart.
 */

/** The first column's header (what the rows cover, "510 · both directions"). */
export const FIGURE_SCOPE_HEAD = 'font-bold text-[var(--text-primary)]';
/** A figure column's header ("This week"); figures and their headers stay on one line (#1917: "1.4 / min" broke). */
export const FIGURE_HEAD = 'block text-right font-normal whitespace-nowrap text-[var(--text-dim)]';
/** The row-name column's header when it only names the rows ("Direction"). */
export const FIGURE_ROW_HEAD = 'font-normal text-[var(--text-dim)]';
/** A row's name (the row header cell). */
export const FIGURE_ROW_LABEL = 'font-bold text-[var(--text-muted)]';
/** The main figure, bold. */
export const FIGURE_MAIN = 'text-right text-sm font-black tracking-tight whitespace-nowrap';
/** The figure it is compared with, muted. */
export const FIGURE_OTHER = 'text-right text-sm whitespace-nowrap text-[var(--text-muted)]';
/** The app's notice style (CARD_NOTICE, as CardHelpNotice), so a card's footnotes and its notices read alike (Ryan, 2026-11-27:
 * "is this the same font we use elsewhere for these notices?"). */
const FOOTNOTE = `${CARD_NOTICE} leading-relaxed`;
const RULED = 'mt-1 border-t border-[var(--border-primary)] pt-1';

/** The card. `title` is a heading above the table, for a table whose first column is not its subject (Right now). */
export function FiguresCard({ label, title, action, children }: { label: string; title?: ReactNode; /** At the end of the title row (SectionNotes), placed as Widget places it. */ action?: ReactNode; children: ReactNode }) {
  // CIV-2021: in Studio's route panel, a section of the panel headed by its label, with no box.
  if (usePanelSections()) return <PanelSection label={typeof title === 'string' ? title : label}>{action && <div className="flex justify-end">{action}</div>}{children}</PanelSection>;
  return (
    <Card as="section" tone="surface" aria-label={label} className="min-w-0 px-2.5 py-1.5">
      {(title || action) && (
        <div className="flex items-start justify-between gap-2 pt-0.5">
          {title && <h3 className="m-0 text-sm font-bold text-[var(--text-primary)]">{title}</h3>}
          {action && <div className="ml-auto">{action}</div>}
        </div>
      )}
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
