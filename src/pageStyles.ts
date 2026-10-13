/** Surfaces shared by the agency and area pages, taken from the app's own tokens (see src/styles.ts). */
import { APP_TAB_INACTIVE, SURFACE } from './styles';

/** The app's panel surface (SURFACE) as a rounded card, without FLOATING_CARD's shadow. */
export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
/** The header's white pill (the same classes as the Compare and History buttons), at a size for a page action. */
export const PILL_BUTTON = `${APP_TAB_INACTIVE} inline-flex h-10 items-center gap-2 px-5 text-sm font-bold`;
/** Unselected pill: the faint grey the app uses only for unselected controls (CONTROL_INACTIVE, no hover). */
export const CHIP = 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] px-2.5 py-0.5 text-xs font-bold';
export const LINK = 'text-[var(--accent)] hover:underline';
