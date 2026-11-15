import type { ReactNode } from 'react';
import { titleCase } from '../../../shared/titleCase';

/**
 * Section headings are titles, in title case (docs/style/VISUAL.md; Ryan, 2026-11-15), so a heading built from a shared
 * label ("Agencies and weekday frequency") reads as a title wherever it's used. A heading written as a sentence (it ends
 * in a full stop or question mark) stays a sentence. Page titles (h1) can carry an agency's own name ("exo"), so their
 * callers pass title-case text themselves.
 */
function headingText(children: ReactNode): ReactNode {
  return typeof children === 'string' && !/[.?!”]$/.test(children.trim()) ? titleCase(children) : children;
}

const PAGE = {
  /** The title of a content page (agency, region, changelog, research, docs, legal). */
  page: 'text-2xl font-black tracking-tight sm:text-3xl',
  /** The big opening line of the About page. */
  hero: 'max-w-3xl text-5xl font-black tracking-[-0.045em] sm:text-7xl',
  /** A research page's title, under "Atlas research" (ResearchHeader, CIV-1176). */
  research: 'text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[0.98]',
  /** A page whose title is on screen some other way (the map): read by screen readers only (#1195). */
  hidden: 'sr-only',
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

/** An h3 heading: a titled part inside a section (the Docs page's sub-headings, CIV-1610). One step below the section heading. */
export function SubsectionTitle({ id, className = '', ariaHidden = false, children }: { id?: string; className?: string; /** Hidden from screen readers when a table caption already names the group. */ ariaHidden?: boolean; children: ReactNode }) {
  return <h3 id={id} aria-hidden={ariaHidden || undefined} className={`${SECTION.item} ${className}`.trim()}>{headingText(children)}</h3>;
}

/** An h2 heading: a section of a page, or (level "item") a titled block inside one. */
export function SectionTitle({ level = 'section', id, className = '', children }: { level?: keyof typeof SECTION; id?: string; className?: string; children: ReactNode }) {
  return <h2 id={id} className={`${SECTION[level]} ${className}`.trim()}>{headingText(children)}</h2>;
}
