import type { ReactNode } from 'react';

/**
 * "How this is measured" at the foot of every Live page: one look everywhere, small muted type, compact, full content
 * width. `collapsible` folds it behind its title (the route pages); the agency page shows it open. Children are the
 * notes (list items), `after` anything below the list.
 */
export default function MethodFootnote({ id, collapsible = false, children, after }: { id?: string; collapsible?: boolean; children: ReactNode; after?: ReactNode }) {
  const title = 'How this is measured';
  const body = (
    <>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[var(--text-muted)]">{children}</ul>
      {after}
    </>
  );
  return collapsible ? (
    <details className="mt-12 border-t border-[var(--border-primary)] pt-3" id={id}>
      <summary className="cursor-pointer text-sm font-bold text-[var(--text-secondary)]">{title}</summary>
      {body}
    </details>
  ) : (
    <section className="mt-12 border-t border-[var(--border-primary)] pt-3" id={id} aria-label={title}>
      <h2 className="text-sm font-bold text-[var(--text-secondary)]">{title}</h2>
      {body}
    </section>
  );
}
