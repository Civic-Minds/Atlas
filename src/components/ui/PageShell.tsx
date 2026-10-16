import type { ReactNode } from 'react';
import SiteHeader from '../SiteHeader';
import SiteFooter from '../SiteFooter';

/**
 * Outer frame of a content page (About, Docs, Changelog, Terms, Research): app background,
 * centred max-w-5xl column, site header on top.
 * `stickyHeader` pins the site header to the top while the page scrolls (long doc pages with an "On this page" list).
 * `footer` adds the site footer, pinned to the bottom of the viewport on short pages.
 * `docs` is the narrower gutter used by reading pages; `wide` is the roomier landing-page gutter.
 */
const GUTTER = {
  docs: 'px-5 py-8 sm:px-8',
  wide: 'px-6 py-8 sm:px-10 lg:px-16',
} as const;

export default function PageShell({ variant = 'docs', stickyHeader = false, footer = true, maxWidth = 'max-w-5xl', children }: { variant?: keyof typeof GUTTER; stickyHeader?: boolean; footer?: boolean; /** Tailwind max-width class for the column (default max-w-5xl). */ maxWidth?: string; children: ReactNode }) {
  return (
    <main className={`flex min-h-screen flex-col bg-[var(--bg-app)] text-[var(--text-primary)] ${GUTTER[variant]}`}>
      <div className={`mx-auto flex w-full ${maxWidth} flex-1 flex-col`}>
        {stickyHeader ? (
          <div className="sticky top-0 z-30 -my-3 bg-[var(--bg-app)] py-3">
            <SiteHeader />
          </div>
        ) : <SiteHeader />}
        <div className="flex-1">{children}</div>
        {footer && <SiteFooter />}
      </div>
    </main>
  );
}
