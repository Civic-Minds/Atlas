import { createContext, useContext, type ReactNode } from 'react';
import { SidebarCardSection } from '../Interval/cardUi';

/**
 * CIV-2021 (Ryan: "Where did this card inside cards design come from"): inside Studio's Live route panel every figures
 * table and widget is a section of the panel, the shared route card's section (a rule and a section label), never a box
 * of its own. The Live tool page keeps its boxes; the panel turns this on for what it holds.
 * CIV-3098: `headings={false}` drops the boxes only, keeping each part's own title as it was (Studio's agency panel).
 */
const PanelSections = createContext<false | { headings: boolean }>(false);

export function PanelSectionsProvider({ headings = true, children }: { headings?: boolean; children: ReactNode }) {
  return <PanelSections.Provider value={{ headings }}>{children}</PanelSections.Provider>;
}

export const usePanelSections = (): boolean => useContext(PanelSections) !== false;

/** Whether a section shows the shared section label (CIV-2021) or keeps its part's own title (CIV-3098). */
export const usePanelSectionHeadings = (): boolean => {
  const c = useContext(PanelSections);
  return c !== false && c.headings;
};

/** One section of the panel: its heading in the shared section label, then what it holds. */
export function PanelSection({ label, title, children, className = '' }: { label: string; title?: string; children: ReactNode; className?: string }) {
  const headings = usePanelSectionHeadings();
  return (
    <section aria-label={label} title={title} className={`min-w-0 ${className}`.trim()}>
      <SidebarCardSection label={headings ? label : undefined}>{children}</SidebarCardSection>
    </section>
  );
}
