import React from 'react';

/**
 * The text part of a top-bar mode tab (Live, History, Compare). While another mode is active the
 * text slides shut so only the icon shows; the tab keeps a title and aria-label naming it. The
 * width change is a short transition, turned off for people who prefer reduced motion.
 */
export function ModeTabLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-out motion-reduce:transition-none ${
        collapsed ? 'max-w-0 opacity-0' : 'max-w-[10rem] opacity-100'
      }`}
      aria-hidden={collapsed || undefined}
    >
      {children}
    </span>
  );
}

/** Class tweaks for a collapsed tab: tighter padding and no gap beside the hidden text. */
export function modeTabSpacing(collapsed: boolean): string {
  return collapsed ? 'px-2.5 gap-0' : 'px-3 gap-1.5';
}

/**
 * The one rule for the top-bar mode tabs: while any non-map view is on (History, Live, Compare,
 * Night, Frequent Service, or a future one), every tab that is not the selected one shows only its
 * icon. On the plain map all tabs stay expanded. Off when the feature is off (public).
 */
export function modeTabCollapsed(enabled: boolean, nonMapViewActive: boolean, selected: boolean): boolean {
  return enabled && nonMapViewActive && !selected;
}

const ModeTabsContext = React.createContext(false);

/** Wrap the page once with whether a non-map view is active. Tabs read it, so none decides on its own. */
export const ModeTabsProvider = ({ nonMapViewActive, children }: { nonMapViewActive: boolean; children: React.ReactNode }) => (
  <ModeTabsContext.Provider value={nonMapViewActive}>{children}</ModeTabsContext.Provider>
);

/** True when the other mode tabs should collapse (a non-map view is on). Feature flag applied by the provider's caller. */
export const useModeTabsCollapseOthers = () => React.useContext(ModeTabsContext);
