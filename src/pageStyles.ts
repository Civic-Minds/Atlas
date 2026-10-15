/** Surfaces shared by the agency and area pages, taken from the app's own tokens (see src/styles.ts). */
import { SURFACE } from './styles';

/** The app's panel surface (SURFACE) as a rounded card, without FLOATING_CARD's shadow. */
export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
/** Main page call to action, the same as the About page's "Try Atlas" link: accent text, no fill or shadow. */
export const PAGE_ACTION = 'inline-flex items-center gap-2 text-sm font-black text-[var(--accent)] hover:underline';
/** Quiet label beside a name ("Live", "History"): the smallest pill size, medium weight, light fill. */
export const TAG = 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--text-muted)] px-1.5 py-0.5 text-xs font-medium';
/** Unselected pill: the faint grey the app uses only for unselected controls (CONTROL_INACTIVE, no hover). */
export const CHIP = 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] px-2.5 py-0.5 text-xs font-bold';
export const LINK = 'text-[var(--accent)] hover:underline';
