/**
 * Wording Ryan hasn't given yet (CIV-1814 item 29): the one way to hold its place. It shows only on the Vite dev server,
 * as "[Placeholder: …]"; on beta, preview and public it is empty. src/content/devPlaceholder.tsx draws it as an element,
 * left out entirely off the dev server. The guard test (placeholderGuard.test.ts) fails on bracketed placeholder text
 * anywhere else. Imports nothing, so shared text files can use it.
 */
export const SHOW_PLACEHOLDERS = import.meta.env?.DEV === true;

/** The placeholder as text, for an attribute or a string slot: "[Placeholder: what]" on the dev server, '' elsewhere. */
export function devPlaceholder(what: string): string {
  return SHOW_PLACEHOLDERS ? `[Placeholder: ${what}]` : '';
}
