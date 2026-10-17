import { Fragment, type ReactNode } from 'react';

/** One group of "How this is measured": a small label, then one line per item. Falsy items are skipped. */
export interface MethodGroup { label: string; items: ReactNode[] }

/** A glossary line: the term in bold, a colon, then its short definition. */
export function Term({ t, children }: { t: string; children: ReactNode }) {
  return <><strong className="font-semibold text-[var(--text-secondary)]">{t}:</strong> {children}</>;
}

/**
 * "How this is measured" at the foot of every Live page: one look everywhere, small muted type (12px, tight lines), compact, full content
 * width, as one paragraph. The notes come in labelled groups (METHOD_GROUPS in shared/liveWording), one line per item, no bullets.
 * `collapsible` folds it behind its title (the route pages); the agency page shows it open. `after` sits below.
 */
export default function MethodFootnote({ id, collapsible = false, groups, after }: { id?: string; collapsible?: boolean; groups: MethodGroup[]; after?: ReactNode }) {
  const title = 'How this is measured';
  // One compact paragraph (CIV-303): each group opens with its bold run-in label, the notes follow inline.
  const body = (
    <>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
        {groups.map(g => {
          const items = g.items.filter(Boolean);
          if (!items.length) return null;
          return (
            <Fragment key={g.label}>
              <strong className="font-semibold text-[var(--text-secondary)]">{g.label}.</strong>{' '}
              {items.map((item, i) => <Fragment key={i}>{item}{' '}</Fragment>)}
            </Fragment>
          );
        })}
      </p>
      {after}
    </>
  );
  return collapsible ? (
    <details className="mt-12 border-t border-[var(--border-primary)] pt-3" id={id}>
      <summary className="cursor-pointer text-xs font-semibold text-[var(--text-secondary)]">{title}</summary>
      {body}
    </details>
  ) : (
    <section className="mt-12 border-t border-[var(--border-primary)] pt-3" id={id} aria-label={title}>
      <h2 className="text-xs font-semibold text-[var(--text-secondary)]">{title}</h2>
      {body}
    </section>
  );
}
