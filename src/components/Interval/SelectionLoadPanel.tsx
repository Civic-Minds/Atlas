import React from 'react';
import { sidebarFrameStyle } from '../../styles';
import Panel from '../ui/Panel';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import PanelEmpty from '../ui/PanelEmpty';
import ArrowLink from '../ui/ArrowLink';
import { loadingText, loadErrorText } from '../../content/stateCopy';

interface SelectionLoadPanelProps {
  /** What is being opened, for the message ("route" or "stop"). */
  kind: 'route' | 'stop' | 'agency';
  /** The data failed to load (or the agency does not exist). */
  failed: boolean;
  /** The data loaded but the selection isn't in it, or doesn't run today (CIV-959): this line replaces the card. */
  notice?: string | null;
  onClose: () => void;
  sidebarLeft?: number;
  searchBarWidth?: number;
}

/** Card placeholder while the selected route or stop's agency data downloads (shown only if it takes a moment), or why it can't open. */
export default function SelectionLoadPanel({ kind, failed, notice, onClose, sidebarLeft, searchBarWidth }: SelectionLoadPanelProps) {
  const slow = useDelayedFlag(!failed && !notice);
  if (!failed && !notice && !slow) return null;
  const close = <ArrowLink as="button" tone="inline" size="xs" onClick={onClose} className="shrink-0 whitespace-nowrap">Close</ArrowLink>;
  return (
    <Panel
      sidebar
      enter
      style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
    >
      {notice ? (
        <PanelEmpty action={close}>{notice}</PanelEmpty>
      ) : failed ? (
        <PanelEmpty kind="error" action={close}>
          {loadErrorText(`this ${kind}`)}
        </PanelEmpty>
      ) : (
        <PanelEmpty kind="loading">{loadingText(kind)}</PanelEmpty>
      )}
    </Panel>
  );
}
