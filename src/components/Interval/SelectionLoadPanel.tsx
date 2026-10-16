import React from 'react';
import { SIDEBAR_LEFT_FALLBACK } from '../../styles';
import Panel from '../ui/Panel';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import PanelEmpty from '../ui/PanelEmpty';
import { loadingText, loadErrorText } from '../../content/stateCopy';

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
        <PanelEmpty kind="error" action={<button type="button" onClick={onClose} className="shrink-0 text-xs font-black text-[var(--accent)] hover:underline">Close</button>}>
          {loadErrorText(`this ${kind}`)}
        </PanelEmpty>
      ) : (
        <PanelEmpty kind="loading">{loadingText(kind)}</PanelEmpty>
      )}
    </Panel>
  );
}
