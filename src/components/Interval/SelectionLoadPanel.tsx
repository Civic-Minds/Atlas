import React from 'react';
import { SIDEBAR_LEFT_FALLBACK, PANEL_EMPTY } from '../../styles';
import Panel from '../ui/Panel';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import Spinner from '../ui/Spinner';

interface SelectionLoadPanelProps {
  /** What is being opened, for the message ("route" or "stop"). */
  kind: 'route' | 'stop';
  /** The data failed to load (or the agency does not exist). */
  failed: boolean;
  onClose: () => void;
  sidebarLeft?: number;
  searchBarWidth?: number;
}

/** Card placeholder while the selected route or stop's agency data downloads, shown only if it takes a moment. */
export default function SelectionLoadPanel({ kind, failed, onClose, sidebarLeft, searchBarWidth }: SelectionLoadPanelProps) {
  const slow = useDelayedFlag(!failed);
  if (!failed && !slow) return null;
  return (
    <Panel
      sidebar
      enter
      style={{
        top: 80,
        '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      {failed ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className={PANEL_EMPTY.replace('px-4 py-3 ', '')}>Couldn't load this {kind}.</span>
          <button type="button" onClick={onClose} className="text-xs font-black text-[var(--accent)] hover:underline">Close</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3" role="status">
          <Spinner />
          <span className="text-xs font-bold text-[var(--text-muted)]">Loading {kind}…</span>
        </div>
      )}
    </Panel>
  );
}
