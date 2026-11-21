import { createContext, useContext, type ReactNode } from 'react';
import { SidebarCardSection } from '../Interval/cardUi';

/**
 * CIV-2021 (Ryan: "Where did this card inside cards design come from"): inside Studio's Live route panel every figures
 * table and widget is a section of the panel, the shared route card's section (a rule and a section label), never a box
 * of its own. The Live tool page keeps its boxes; the panel turns this on for what it holds.
 */
const PanelSections = createContext(false);

export function PanelSectionsProvider({ children }: { children: ReactNode }) {
  return <PanelSections.Provider value>{children}</PanelSections.Provider>;
}

export const usePanelSections = (): boolean => useContext(PanelSections);

/** One section of the panel: its heading in the shared section label, then what it holds. */
export function PanelSection({ label, title, children, className = '' }: { label: string; title?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} title={title} className={`min-w-0 ${className}`.trim()}>
      <SidebarCardSection label={label}>{children}</SidebarCardSection>
    </section>
  );
}
