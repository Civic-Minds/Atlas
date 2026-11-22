import { useSyncExternalStore } from 'react';

/**
 * CIV-461 (Ryan: "maybe if u click on the name then it opens the thing in the source list in about?"): the agency whose
 * credit About → Schedule sources scrolls to when it opens from the map's credit pill. A small store of its own, so the
 * map and the About panel share it without new props through App.
 */
let focus: { slug: string | null; n: number } = { slug: null, n: 0 };
const listeners = new Set<() => void>();

/** Ask Schedule sources to show this agency's credit (null: the top of the list). */
export function focusSource(slug: string | null): void {
  focus = { slug, n: focus.n + 1 };
  for (const l of listeners) l();
}

export function useSourcesFocus(): { slug: string | null; n: number } {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => focus,
  );
}

/** The element id of an agency's credit card in Schedule sources. */
export const sourceCreditId = (slug: string) => `source-credit-${slug}`;
