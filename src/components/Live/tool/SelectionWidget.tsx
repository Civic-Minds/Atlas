import type { ReactNode } from 'react';
import Widget from './Widget';

/** The picked stop or segment, on top of the panel: its name as the title and the compact lines under it. */
export default function SelectionWidget({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Widget title={title} size="medium">
      <div className="space-y-0.5 text-sm text-[var(--text-secondary)]">{children}</div>
    </Widget>
  );
}
