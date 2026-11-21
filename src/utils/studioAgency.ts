const KEY = 'atlas_studio_agency';

/** CIV-1883: the agency Studio was last on, kept in this browser so Studio reopens on it (storage can be blocked: null then). */
export function getSavedStudioAgency(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function saveStudioAgency(slug: string): void {
  try { localStorage.setItem(KEY, slug); } catch { /* private window or blocked storage: Studio just opens on its default */ }
}
