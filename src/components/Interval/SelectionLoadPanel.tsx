import React from 'react';
import { sidebarFrameStyle } from '../../styles';
import Panel from '../ui/Panel';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import PanelEmpty from '../ui/PanelEmpty';
import { CardBackLink } from '../CardBack';
import { BACK_TO_MAP_LABEL, loadingText, loadErrorText } from '../../content/noticeCopy';

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
      style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}
    >
      {failed ? (
        <NoteWithBack onClose={onClose} kind="error">{loadErrorText(`this ${kind}`)}</NoteWithBack>
      ) : (
        <PanelEmpty kind="loading">{loadingText(kind)}</PanelEmpty>
      )}
    </Panel>
  );
}

/**
 * A note in a card's place, closed the way every map card is: "← Map" above it (CIV-1145), not a link-styled "Close →"
 * at the end of the line.
 */
function NoteWithBack({ onClose, kind, children }: { onClose: () => void; kind?: 'error'; children: React.ReactNode }) {
  return (
    <>
      <div className="px-4 pt-3"><CardBackLink onClick={onClose}>{BACK_TO_MAP_LABEL}</CardBackLink></div>
      <div className="-mt-2"><PanelEmpty kind={kind}>{children}</PanelEmpty></div>
    </>
  );
}

/** A card that can't be shown says why in its place (N17, N18, N30). */
export function SelectionNoticePanel({ message, onClose, sidebarLeft, searchBarWidth }: { message: string; onClose: () => void; sidebarLeft?: number; searchBarWidth?: number }) {
  return (
    <Panel sidebar enter style={sidebarFrameStyle(sidebarLeft, searchBarWidth)}>
      <NoteWithBack onClose={onClose}>{message}</NoteWithBack>
    </Panel>
  );
}
