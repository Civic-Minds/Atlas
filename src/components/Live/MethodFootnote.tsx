import type { ReactNode } from 'react';

/** One group of "How this is measured": a small label, then one line per item. Falsy items are skipped. */
export interface MethodGroup { label: string; items: ReactNode[] }

/** A glossary line: the term in bold, a colon, then its short definition. */
export function Term({ t, children }: { t: string; children: ReactNode }) {
  return <><strong className="font-semibold text-[var(--text-secondary)]">{t}:</strong> {children}</>;
}

/**
 * "How this is measured" at the foot of every Live page: one look everywhere, small muted type (12px, tight lines), compact, full content
 * width, the groups in two columns on wider screens. The notes come in labelled groups (METHOD_GROUPS in shared/liveWording), one line per item, no bullets.
 * `collapsible` folds it behind its title (the route pages); the agency page shows it open. `after` sits below.
 */
export default function MethodFootnote({ id, collapsible = false, groups, after }: { id?: string; collapsible?: boolean; groups: MethodGroup[]; after?: ReactNode }) {
  const title = 'How this is measured';
  const body = (
    <div className="mt-2 grid gap-x-8 gap-y-2 md:grid-cols-2">
      {groups.map(g => {
        const items = g.items.filter(Boolean);
        if (!items.length) return null;
        return (
          <div key={g.label} className="min-w-0">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{g.label}</h3>
            <ul className="mt-0.5 list-none space-y-0.5 text-xs leading-4 text-[var(--text-muted)]">
              {items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
        );
      })}
      {after && <div className="md:col-span-2">{after}</div>}
    </div>
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
