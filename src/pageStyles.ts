/** Surfaces shared by the agency and area pages, taken from the app's own tokens (see src/styles.ts). */
import { SURFACE } from './styles';

/** The app's panel surface (SURFACE) as a rounded card, without FLOATING_CARD's shadow. */
export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
/** Selected pill over a page: identical to CONTROL_ACTIVE_GLASS on fix/selected-state-tokens (opaque panel base with the selected tint on top). Switch to that export once it is on main. */
export const CONTROL_ACTIVE_GLASS = 'bg-[var(--bg-panel)] [background-image:linear-gradient(var(--control-active-bg),var(--control-active-bg))] border-[var(--control-active-border)] text-[var(--control-active-fg)]';
/** Unselected pill: the faint grey the app uses only for unselected controls (CONTROL_INACTIVE, no hover). */
export const CHIP = 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] px-2.5 py-0.5 text-xs font-bold';
export const LINK = 'text-[var(--accent)] hover:underline';
