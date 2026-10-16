import type { ReactNode } from 'react';
import { PANEL_SECTION_HEAD } from '../../styles';

/**
 * The heading above an agency's routes inside a list panel. A thin rule sits above it, except on the first
 * heading, which has one below instead (`rule`). Put an `AgencyName` inside for the name and its place.
 */
export default function AgencyGroupHeader({ rule = 'above', children }: { rule?: 'above' | 'below' | 'none'; children: ReactNode }) {
  const line = rule === 'above' ? ' border-t border-[var(--border-primary)]' : rule === 'below' ? ' border-b border-[var(--border-primary)]' : '';
  return <div className={`${PANEL_SECTION_HEAD}${line}`}>{children}</div>;
}
