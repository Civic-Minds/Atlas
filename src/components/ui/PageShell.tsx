import { useEffect, useRef, type ReactNode } from 'react';
import SiteHeader from '../SiteHeader';
import SiteFooter from '../SiteFooter';

/**
 * Outer frame of a content page (About, Docs, Changelog, Terms, Research): app background,
 * centred max-w-5xl column, site header on top.
 * The site header is always pinned to the top while the page scrolls, so it behaves the same on every page (CIV-1708).
 * `footer` adds the site footer, pinned to the bottom of the viewport on short pages.
 * `method` is a research page's "Method" section (CIV-1167), set off above the footer.
 * `docs` is the narrower gutter used by reading pages; `wide` is the roomier landing-page gutter.
 */
const GUTTER = {
  docs: 'px-5 py-8 sm:px-8',
  wide: 'px-6 py-8 sm:px-10 lg:px-16',
} as const;

export default function PageShell({ variant = 'docs', footer = true, maxWidth = 'max-w-5xl', method, children }: { variant?: keyof typeof GUTTER; footer?: boolean; /** Tailwind max-width class for the column (default max-w-5xl). */ maxWidth?: string; method?: ReactNode; children: ReactNode }) {
  // CIV-1897: the pinned header's height (taller with the internal row) as --page-header-h, so a sticky side menu sits the same gap below it.
  const mainRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const main = mainRef.current, header = headerRef.current;
    if (!main || !header || typeof ResizeObserver === 'undefined') return;
    const set = () => main.style.setProperty('--page-header-h', `${header.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);
  return (
    <main ref={mainRef} className={`flex min-h-screen flex-col overflow-x-clip bg-[var(--bg-app)] text-[var(--text-primary)] ${GUTTER[variant]}`}>
      <div className={`mx-auto flex w-full ${maxWidth} flex-1 flex-col`}>
        <div ref={headerRef} data-page-header className="sticky top-0 z-30 -my-3 bg-[var(--bg-app)] py-3">
          <SiteHeader />
        </div>
        <div className="flex-1">{children}</div>
        {method && <section data-research-method className="mx-auto mt-8 w-full max-w-3xl border-t border-[var(--border-primary)] pt-10 sm:mt-16">{method}</section>}
        {footer && <SiteFooter />}
      </div>
    </main>
  );
}
