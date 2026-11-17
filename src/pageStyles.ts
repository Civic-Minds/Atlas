/** Surfaces shared by the pages, taken from the app's own tokens (see src/styles.ts). */
import { SURFACE } from './styles';

/** The app's panel surface (SURFACE) as a rounded card: the Live route page's figure tiles. */
export const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
export const LINK = 'text-[var(--accent)] hover:underline';
/** LINK, always underlined: links inside running text and link lists on the pages. */
export const UNDERLINED_LINK = `${LINK} underline underline-offset-2`;
