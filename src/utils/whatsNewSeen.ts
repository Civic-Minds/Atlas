/**
 * Whether this browser has opened What's New since the current release (Ryan, page-names refactor): the map's What's New
 * button shows a small dot until it's opened, and the dot comes back with the next release. The last opened version is
 * kept in this browser only; storage that's blocked or full just means the dot shows.
 */
const SEEN_KEY = 'atlas:whatsNewSeenVersion';

export function whatsNewUnseen(version: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== version;
  } catch {
    return true;
  }
}

export function markWhatsNewSeen(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Storage blocked: the dot stays, which is harmless.
  }
}
