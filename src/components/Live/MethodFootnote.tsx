import { Fragment, type ReactNode } from 'react';

/** One group of "How this is measured": its heading, then its items as one paragraph. Falsy items are skipped. */
export interface MethodGroup { label: string; items: ReactNode[] }

/**
 * A glossary line: the term in bold, then its definition as the rest of the sentence ("**Late** is …"), no colon (Ryan, CIV-1075).
 * `colon` for the lines Ryan wrote with one ("**Near a limit**: …", "**Routes covered**: …").
 */
export function Term({ t, colon = false, children }: { t: string; colon?: boolean; children: ReactNode }) {
  return <><strong className="font-semibold text-[var(--text-secondary)]">{t}</strong>{colon ? ':' : ''} {children}</>;
}

/**
 * "How this is measured" at the foot of every Live page: one look everywhere, small muted type (12px, tight lines), compact, full content
 * width. The notes come in groups (METHOD_GROUPS in shared/liveWording): each group's heading on its own line, then one paragraph with its
 * items running on as sentences, and space between groups (Ryan's layout A, CIV-1075). No bullets.
 * Always open: the explanations of the math stay visible on every page. `after` sits below.
 */
export default function MethodFootnote({ id, groups, after }: { id?: string; groups: MethodGroup[]; after?: ReactNode }) {
  const title = 'How this is measured';
  const body = (
    <>
      <div className="mt-2 space-y-3 text-xs leading-5 text-[var(--text-muted)]">
        {groups.map(g => {
          const items = g.items.filter(Boolean);
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <h3 className="font-semibold text-[var(--text-secondary)]">{g.label}</h3>
              <p>{items.map((item, i) => <Fragment key={i}>{i > 0 && ' '}{item}</Fragment>)}</p>
            </div>
          );
        })}
      </div>
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
