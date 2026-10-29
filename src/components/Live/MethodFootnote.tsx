import { Fragment, type ReactNode } from 'react';

/** One group of "How this is measured": a small label, then one line per item. Falsy items are skipped. */
export interface MethodGroup { label: string; items: ReactNode[] }

/** An item that stands on a line of its own inside the running paragraph. */
export function OwnLine({ children, title }: { children: ReactNode; title?: string }) {
  return <span className="block" title={title}>{children}</span>;
}

/**
 * A glossary line: the term in bold, then its definition as the rest of the sentence ("**Late** is …"), no colon (Ryan, CIV-1075).
 * `colon` for the lines Ryan wrote with one ("**Near a limit**: …", "**Routes covered**: …").
 */
export function Term({ t, colon = false, children }: { t: string; colon?: boolean; children: ReactNode }) {
  return <><strong className="font-semibold text-[var(--text-secondary)]">{t}</strong>{colon ? ':' : ''} {children}</>;
}

/**
 * "How this is measured" at the foot of every Live page: one look everywhere, small muted type (12px, tight lines), compact, full content
 * width. The notes come in labelled groups (METHOD_GROUPS in shared/liveWording), each label on its own line and one line per item under it, no bullets.
 * Always open: the explanations of the math stay visible on every page. `after` sits below.
 */
export default function MethodFootnote({ id, groups, after }: { id?: string; groups: MethodGroup[]; after?: ReactNode }) {
  const title = 'How this is measured';
  // One compact block (CIV-303): each group's bold label, then each definition on its own line under it (Ryan, CIV-1075).
  const body = (
    <>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
        {groups.map(g => {
          const items = g.items.filter(Boolean);
          if (!items.length) return null;
          return (
            <Fragment key={g.label}>
              <strong className="block font-semibold text-[var(--text-secondary)]">{g.label}.</strong>
              {items.map((item, i) => <span key={i} className="block">{item}</span>)}
            </Fragment>
          );
        })}
      </p>
      {after}
    </>
  );
  return (
    <section className="mt-12 border-t border-[var(--border-primary)] pt-3" id={id} aria-label={title}>
      <h2 className="text-xs font-semibold text-[var(--text-secondary)]">{title}</h2>
      {body}
    </section>
  );
}
