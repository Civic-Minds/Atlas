/** Surfaces shared by the pages, taken from the app's own tokens (see src/styles.ts). */

export const LINK = 'text-[var(--accent)] hover:underline';
/** LINK, always underlined: links inside running text and link lists on the pages. */
export const UNDERLINED_LINK = `${LINK} underline underline-offset-2`;

/** The research stories' section headings and body paragraphs, one look each (CIV-1804). */
export const STORY_HEADING = 'text-3xl sm:text-4xl font-black tracking-tight';
export const STORY_PARAGRAPH = 'mt-5 text-base leading-8 text-[var(--text-muted)]';
/** A research story's chart panel: wide rounded corners on the panel surface; each page adds its own padding (CIV-1804). */
export const STORY_CHART_PANEL = 'rounded-[2rem] border border-[var(--border-primary)] bg-[var(--bg-panel)]';
