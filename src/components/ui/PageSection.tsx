import type { ReactNode } from 'react';
import { SectionTitle } from './PageTitle';
import ScrollX from './ScrollX';

/**
 * A titled section of a data page (the area and state pages' agencies, the Live report pages): the space above it, its
 * title, and the muted line under the title that says what the section shows. One component, so those pages share the
 * spacing and text sizes instead of each writing its own (CIV-1404).
 * `shrink` lets wide content (a table, a chart) narrow inside a grid or flex parent.
 */
export default function PageSection({ id, title, intro, shrink = false, children }: {
  /** The title's id; the section is labelled by it. */
  id: string; title: ReactNode; intro?: ReactNode; shrink?: boolean; children: ReactNode;
}) {
  return (
    <section className={shrink ? 'mt-14 min-w-0' : 'mt-14'} aria-labelledby={id}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {intro && <p className={PAGE_SECTION_NOTE}>{intro}</p>}
      {children}
    </section>
  );
}

/** The muted line of text inside a section: under its title, or under a chart. */
export const PAGE_SECTION_NOTE = 'mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]';

/**
 * The box a section's table sits in: the gap above it, and sideways scroll with a fade at the right edge when the table
 * is wider than the page. `linkedRows` (a DataTable with `rowHref`) lets the row highlight reach a little past the text
 * on both sides while the text stays in line with the page.
 */
export function PageTable({ linkedRows = false, children }: { linkedRows?: boolean; children: ReactNode }) {
  return <ScrollX className={linkedRows ? 'mt-6 -mx-2' : 'mt-6'}>{children}</ScrollX>;
}
