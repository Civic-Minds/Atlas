import type { ReactNode } from 'react';
import type { WidgetSize } from './Widget';

export interface PanelWidget {
  key: string;
  /** small: half the panel's width (a figure or a short summary); medium and large: the full width (a list or a chart). */
  size: WidgetSize;
  /** Figure tiles are list items; they sit in a list of their own. */
  tile?: boolean;
  node: ReactNode;
}

/**
 * The widget panel: a two-column grid, every widget shown at once. Small widgets take half the width, so two sit side by
 * side; medium and large ones take the full width. Nothing scrolls, collapses or pages: what does not fit is cut, not hidden.
 */
export default function WidgetPanel({ widgets, className = '' }: { widgets: readonly PanelWidget[]; className?: string }) {
  return (
    <div className={`grid min-h-0 grid-cols-2 content-start gap-3 overflow-hidden ${className}`.trim()}>
      {widgets.map(w => (
        w.tile
          ? <ul key={w.key} className={`m-0 flex list-none p-0 [&>li]:flex-1 ${w.size === 'small' ? '' : 'col-span-2'}`}>{w.node}</ul>
          : <div key={w.key} className={`flex min-w-0 [&>section]:flex-1 ${w.size === 'small' ? '' : 'col-span-2'}`}>{w.node}</div>
      ))}
    </div>
  );
}
