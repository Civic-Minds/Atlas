import { forwardRef, type ComponentProps } from 'react';
import Panel from './Panel';
import { SIDEBAR_CARD_ABOVE_KEY } from '../../mapOverlayLayout';

/**
 * The one wide sidebar panel frame for map pages, Studio's Live, Fleet and Schedules (CIV-1925, Ryan: "The panels in all 3 pages
 * have a slightly different base frame"; moved here with CIV-2003): the shared sidebar Panel above the map key, at the
 * frame's place and the search bar's width like every left card (#1917: it was 24.5rem, wider than the bar).
 */
const WidePanel = forwardRef<HTMLDivElement, Omit<ComponentProps<typeof Panel>, 'sidebar' | 'enter' | 'className'>>(
  function WidePanel(props, ref) {
    return <Panel sidebar enter ref={ref} className={SIDEBAR_CARD_ABOVE_KEY} {...props} />;
  },
);
export default WidePanel;
