import Panel from './ui/Panel';
import PanelEmpty from './ui/PanelEmpty';
import { ModeFadeInOnMount } from './ModeTransition';
import { useSidebarFrame } from '../context/SidebarFrame';
import { loadingText } from '../content/noticeCopy';
import { FEATURES } from '../../shared/config';

/**
 * The one loading panel a view shows where its sidebar card will open (CIV-1925 phase 4; History's since #1028 item 20):
 * the shared sidebar frame, the shared loading line, fading in from its first painted frame (CIV-1567). Every lazily
 * loaded view uses it as its fallback, and a view's own "still loading" state shows the same.
 */
export default function ViewLoadingPanel({ what }: { what: string }) {
  const { style } = useSidebarFrame();
  return (
    <ModeFadeInOnMount enabled={FEATURES.modeTransitions}>
      {fade => (
        <Panel sidebar style={style} className={fade || undefined}>
          <PanelEmpty kind="loading">{loadingText(what)}</PanelEmpty>
        </Panel>
      )}
    </ModeFadeInOnMount>
  );
}

/** The same loading line inside an open card, where only one section is still loading (CIV-2003: Fleet's vehicles). */
export function CardLoadingLine({ what }: { what: string }) {
  return <PanelEmpty kind="loading" inline>{loadingText(what)}</PanelEmpty>;
}
