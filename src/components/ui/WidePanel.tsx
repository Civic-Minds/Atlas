import { forwardRef, type ComponentProps } from 'react';
import Panel from './Panel';
import { SIDEBAR_CARD_ABOVE_KEY } from '../../mapOverlayLayout';

/**
 * The one wide sidebar panel frame for map pages, Studio's Live, Fleet and Schedules (CIV-1925, Ryan: "The panels in all 3 pages
 * have a slightly different base frame"; moved here with CIV-2003): the shared sidebar Panel at the wide width, above the
 * map key, at the frame's place.
 */
const WidePanel = forwardRef<HTMLDivElement, Omit<ComponentProps<typeof Panel>, 'sidebar' | 'wide' | 'enter' | 'className'>>(
  function WidePanel(props, ref) {
    return <Panel sidebar wide enter ref={ref} className={SIDEBAR_CARD_ABOVE_KEY} {...props} />;
  },
);
export default WidePanel;
