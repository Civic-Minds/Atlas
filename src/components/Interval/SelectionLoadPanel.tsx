import React from 'react';
import { SIDEBAR_LEFT_FALLBACK } from '../../styles';
import Panel from '../ui/Panel';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import PanelEmpty from '../ui/PanelEmpty';
import ArrowLink from '../ui/ArrowLink';
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
        '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
        ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
      } as React.CSSProperties}
    >
      {failed ? (
        <PanelEmpty kind="error" action={<ArrowLink as="button" tone="inline" size="xs" onClick={onClose} className="shrink-0 whitespace-nowrap">Close</ArrowLink>}>
          {loadErrorText(`this ${kind}`)}
        </PanelEmpty>
      ) : (
        <PanelEmpty kind="loading">{loadingText(kind)}</PanelEmpty>
      )}
    </Panel>
  );
}
