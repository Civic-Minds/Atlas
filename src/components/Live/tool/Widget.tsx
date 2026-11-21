import type { ReactNode } from 'react';
import Card from '../../ui/Card';
import { PanelSection, usePanelSections } from '../panelSections';

/** The fixed widget sizes, in grid units of a two-column panel: small is one unit, medium two across, large two by two. */
export type WidgetSize = 'small' | 'medium' | 'large';

/**
 * A widget bigger than a figure tile: the same surface Card (CIV-1800), radius, border and title as the Live figure
 * tiles, with a chart or a list as its one thing. Small figure tiles are KpiTile itself.
 */
export default function Widget({ title, size: _size = 'medium', children, className = '', action, hint, label }: { /** The heading; none for a widget the page names already (CIV-1828), which then needs `label`. */ title?: string; size?: WidgetSize; children: ReactNode; className?: string; /** A small control at the end of the title row. */ action?: ReactNode; /** Hover text for the whole widget. */ hint?: string; /** The accessible name when there is no heading. */ label?: string }) {
  // CIV-2021: in Studio's route panel, a section of the panel under the same heading style, with no box.
  const sections = usePanelSections();
  if (sections) {
    return (
      <PanelSection label={title ?? label ?? ''} title={hint} className={className}>
        {action && <div className="flex justify-end">{action}</div>}
        {children}
      </PanelSection>
    );
  }
  return (
    <Card as="section" tone="surface" aria-label={title ?? label} title={hint} className={`min-w-0 flex h-full min-h-0 flex-col overflow-hidden p-3 ${className}`.trim()}>
      {(title || action) && (
        <div className="flex shrink-0 items-center justify-between gap-2">
          {title && <h3 className="m-0 truncate text-sm font-bold text-[var(--text-muted)]">{title}</h3>}
          {action}
        </div>
      )}
      <div className={`${title || action ? 'mt-2 ' : ''}min-h-0 flex-1 overflow-hidden`}>{children}</div>
    </Card>
  );
}
