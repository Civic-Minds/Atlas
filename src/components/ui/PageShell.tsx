import type { ReactNode } from 'react';
import SiteHeader from '../SiteHeader';

/**
 * Outer frame of a content page (About, Docs, Changelog, Terms, Research): app background,
 * centred max-w-5xl column, site header on top.
 * `docs` is the narrower gutter used by reading pages; `wide` is the roomier landing-page gutter.
 */
const GUTTER = {
  docs: 'px-5 py-8 sm:px-8',
  wide: 'px-6 py-8 sm:px-10 lg:px-16',
} as const;

export default function PageShell({ variant = 'docs', children }: { variant?: keyof typeof GUTTER; children: ReactNode }) {
  return (
    <main className={`min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] ${GUTTER[variant]}`}>
      <div className="max-w-5xl mx-auto">
        <SiteHeader />
        {children}
      </div>
    </main>
  );
}
