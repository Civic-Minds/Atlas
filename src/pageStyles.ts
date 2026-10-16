/** Surfaces shared by the pages, taken from the app's own tokens (see src/styles.ts). */
import { SURFACE } from './styles';

/** The app's panel surface (SURFACE) as a rounded card, without FLOATING_CARD's shadow: the Live route page's figure tiles. */
export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
/** Main page call to action, the same as the About page's "Try Atlas" link: accent text, no fill or shadow. */
export const PAGE_ACTION = 'inline-flex items-center gap-2 text-sm font-black text-[var(--accent)] hover:underline';
export const LINK = 'text-[var(--accent)] hover:underline';
