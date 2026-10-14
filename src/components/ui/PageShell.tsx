import type { ReactNode } from 'react';
import SiteHeader from '../SiteHeader';

/**
 * Outer frame of a content page (About, Docs, Changelog, Terms, Research): app background,
 * centred max-w-5xl column, site header on top.
 * `stickyHeader` pins the site header to the top while the page scrolls (long doc pages with an "On this page" list).
 * `docs` is the narrower gutter used by reading pages; `wide` is the roomier landing-page gutter.
 */
const GUTTER = {
  docs: 'px-5 py-8 sm:px-8',
  wide: 'px-6 py-8 sm:px-10 lg:px-16',
} as const;

export default function PageShell({ variant = 'docs', stickyHeader = false, children }: { variant?: keyof typeof GUTTER; stickyHeader?: boolean; children: ReactNode }) {
  return (
    <main className={`min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] ${GUTTER[variant]}`}>
      <div className="max-w-5xl mx-auto">
        {stickyHeader ? (
          <div className="sticky top-0 z-30 -my-3 bg-[var(--bg-app)] py-3">
            <SiteHeader />
          </div>
        ) : <SiteHeader />}
        {children}
      </div>
    </main>
  );
}
