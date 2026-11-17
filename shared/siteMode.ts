/**
 * The one place that turns a build mode into the word that says which Atlas this is (CIV-1692, Ryan: Beta on beta,
 * Internal on the local dev server, none on public). The wordmark's tag and the tab title's prefix both read it,
 * so they cannot disagree. Keep this file free of import.meta so plain Node scripts and the share-preview API can load it.
 */
export type SiteMode = 'public' | 'preview' | 'beta' | 'dev';

/** The one Beta tag (CIV-1780, Ryan: one constant wherever the meaning is the same): beside the wordmark, in the tab title and on a What's New item. */
export const BETA_TAG = 'Beta';
export const HEADER_TAG_INTERNAL = 'Internal';

/** The mode's word, or null for none. Preview builds from the Beta project in beta mode, so it has none here (its tab keeps "[Preview]"). */
export function siteModeLabel(mode: SiteMode): string | null {
  if (mode === 'beta') return BETA_TAG;
  if (mode === 'dev') return HEADER_TAG_INTERNAL;
  return null;
}
