import { FEATURES } from '../../../shared/config';
import { CONTROL_ACTIVE_GLASS, GLASS_PILL, TOP_BAR_OUTLINE } from '../../styles';

/**
 * The top bar's chip, one style for every map's top bar (CIV-1821: the main map's Frequency, Day, Time, Mode and
 * Agencies chips, and the map apps' menus): an h-8 glass pill, white, with the active fill where its value is set.
 * CIV-1567: the fill is a layer that fades (a background image cannot ease), so a chip whose value a mode changes
 * cross-fades instead of switching in one frame.
 */
export const topBarChipClass = (active: boolean): string => FEATURES.modeTransitions
  ? `relative h-8 px-3.5 flex items-center justify-center ${GLASS_PILL} border text-xs font-bold transition-colors duration-300 ease-out whitespace-nowrap bg-[var(--bg-panel)] before:absolute before:inset-0 before:-z-10 before:rounded-full before:[background-image:linear-gradient(var(--control-active-bg),var(--control-active-bg))] before:transition-opacity before:duration-300 before:ease-out ${
    active
      ? 'border-[var(--control-active-border)] text-[var(--control-active-fg)] before:opacity-100'
      : `${TOP_BAR_OUTLINE} text-[var(--text-primary)] hover:text-[var(--accent)] before:opacity-0`
  }`
  : `relative h-8 px-3.5 flex items-center justify-center ${GLASS_PILL} border text-xs font-bold transition-colors whitespace-nowrap ${
    active
      ? CONTROL_ACTIVE_GLASS
      : `bg-[var(--bg-panel)] ${TOP_BAR_OUTLINE} text-[var(--text-primary)] hover:text-[var(--accent)]`
  }`;
