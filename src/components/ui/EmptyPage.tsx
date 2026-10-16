import type { ReactNode } from 'react';
import PageShell from './PageShell';
import { PageTitle } from './PageTitle';

/** A whole page that says "nothing here" (no such agency, no such region, no such address) with one way out. */
export default function EmptyPage({ title, body, action, footer = true }: { title: string; body: string; /** Usually an ArrowLink. */ action: ReactNode; footer?: boolean }) {
  return (
    <PageShell variant="wide" footer={footer}>
      <PageTitle className="mt-24">{title}</PageTitle>
      <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{body}</p>
      <div className="mt-6">{action}</div>
    </PageShell>
  );
}
