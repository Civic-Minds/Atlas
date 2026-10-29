import type { ReactNode } from 'react';
import PageShell from './PageShell';
import { PageTitle } from './PageTitle';

/** A whole page that says "nothing here" (no such agency, no such region, no such address) with one way out. */
export default function EmptyPage({ title, body, action, footer = true, maxWidth }: {
  title: ReactNode;
  /** Text, or text with inline parts (a command in `code`). */
  body: ReactNode;
  /** Usually an ArrowLink. Left out when there is nowhere to send people. */
  action?: ReactNode;
  footer?: boolean;
  /** The page column's width, for a page whose loaded state is wider than the default. */
  maxWidth?: string;
}) {
  return (
    <PageShell variant="wide" footer={footer} maxWidth={maxWidth}>
      <PageTitle className="mt-24">{title}</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </PageShell>
  );
}
