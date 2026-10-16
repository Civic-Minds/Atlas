import type { ReactNode } from 'react';

const PAGE = {
  /** The title of a content page (agency, region, changelog, research, docs, legal). */
  page: 'text-2xl font-black tracking-tight sm:text-3xl',
  /** The big opening line of the About page. */
  hero: 'max-w-3xl text-5xl font-black tracking-[-0.045em] sm:text-7xl',
} as const;

const SECTION = {
  /** A section of a page. */
  section: 'text-xl font-black tracking-tight',
  /** A titled block inside a section (an entry, a card, a policy clause). */
  item: 'text-base font-black text-[var(--text-primary)]',
} as const;

/** The h1 of a page. One scale for every page, so the same kind of page looks the same. */
export function PageTitle({ level = 'page', id, className = '', children }: { level?: keyof typeof PAGE; id?: string; className?: string; children: ReactNode }) {
  return <h1 id={id} className={`${PAGE[level]} ${className}`.trim()}>{children}</h1>;
}

/** An h2 heading: a section of a page, or (level "item") a titled block inside one. */
export function SectionTitle({ level = 'section', id, className = '', children }: { level?: keyof typeof SECTION; id?: string; className?: string; children: ReactNode }) {
  return <h2 id={id} className={`${SECTION[level]} ${className}`.trim()}>{children}</h2>;
}
