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
 * icon. On the plain map all tabs stay expanded, except on a narrow top bar (`narrow`, below 1088px
 * wide), where the unselected tabs also show only their icon so the bar fits on one line without
 * squeezing the search bar, whose width the cards below it copy (#1007).
 * The non-map rule is off when the feature is off (public).
 */
export function modeTabCollapsed(enabled: boolean, nonMapViewActive: boolean, selected: boolean, narrow = false): boolean {
  return !selected && ((enabled && nonMapViewActive) || narrow);
}

/**
 * Below this width the top bar has no room for the mode tabs' text beside a full-width search bar
 * and the filters (measured with History "22+" and Compare showing, Live off; rescan if a tab is added).
 */
export const NARROW_TOP_BAR_QUERY = '(max-width: 1087px)';

const ModeTabsContext = React.createContext(false);

/** Wrap the page once with whether a non-map view is active. Tabs read it, so none decides on its own. */
export const ModeTabsProvider = ({ nonMapViewActive, children }: { nonMapViewActive: boolean; children: React.ReactNode }) => (
  <ModeTabsContext.Provider value={nonMapViewActive}>{children}</ModeTabsContext.Provider>
);

/** True when the other mode tabs should collapse (a non-map view is on). Feature flag applied by the provider's caller. */
export const useModeTabsCollapseOthers = () => React.useContext(ModeTabsContext);
