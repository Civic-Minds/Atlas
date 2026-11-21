import { forwardRef, type ComponentProps } from 'react';
import Panel from '../../components/ui/Panel';
import { SIDEBAR_CARD_ABOVE_KEY } from '../../mapOverlayLayout';

/**
 * The one panel frame for Studio's Live, Fleet and Schedules pages (CIV-1925, Ryan: "The panels in all 3 pages have a
 * slightly different base frame"): the shared sidebar Panel at the wide width, above the map key, at the frame's place.
 */
const StudioPanel = forwardRef<HTMLDivElement, Omit<ComponentProps<typeof Panel>, 'sidebar' | 'wide' | 'enter' | 'className'>>(
  function StudioPanel(props, ref) {
    return <Panel sidebar wide enter ref={ref} className={SIDEBAR_CARD_ABOVE_KEY} {...props} />;
  },
);
export default StudioPanel;
