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

/** Whether a mode tab should collapse: another mode is active and the feature is on. */
export function modeTabCollapsed(enabled: boolean, activeMode: string | null, self: string): boolean {
  return enabled && activeMode != null && activeMode !== self;
}
