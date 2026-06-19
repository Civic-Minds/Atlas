export function normalizeStopName(name: string): string {
  return name
    .replace(/\s+platform\s+\w+/gi, '')
    .replace(/\s+bay\s+\w+/gi, '')
    .replace(/\s+stop\s+\w+/gi, '')
    .replace(/\s+bus(\s+terminal)?$/gi, '')
    .replace(/\s+(train|rail)(\s+station)?$/gi, '')
    .replace(/\bopposite\b.*/i, '')
    .trim();
}

export interface StopEntry {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  agencySlug: string;
  agencyName: string;
  stopId: string;
}

function pickCanonicalStop(a: StopEntry, b: StopEntry): StopEntry {
  if (a.displayName.length !== b.displayName.length) {
    return a.displayName.length < b.displayName.length ? a : b;
  }
  if (a.name.length !== b.name.length) {
    return a.name.length < b.name.length ? a : b;
  }
  return a;
}

/** One entry per normalized stop name; shortest label wins cross-agency collisions. */
export function buildStopCatalog(
  stopsIndexes: Record<string, Record<string, { name: string; lat: number; lon: number }>>,
  agencies: Array<{ slug: string; name: string }>,
): StopEntry[] {
  const byKey = new Map<string, StopEntry>();
  for (const [slug, index] of Object.entries(stopsIndexes)) {
    const agency = agencies.find(a => a.slug === slug);
    for (const [stopId, s] of Object.entries(index)) {
      const displayName = normalizeStopName(s.name);
      const key = displayName.toLowerCase();
      const entry: StopEntry = {
        stopId,
        agencySlug: slug,
        agencyName: agency?.name ?? slug,
        displayName,
        ...s,
      };
      const prev = byKey.get(key);
      byKey.set(key, prev ? pickCanonicalStop(prev, entry) : entry);
    }
  }
  return [...byKey.values()];
}

/** Higher score = better match. Returns -1 when query is not found. */
export function rankStopMatch(displayName: string, query: string): number {
  const name = displayName.toLowerCase();
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !name.includes(q)) return -1;

  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 - (name.length - q.length) * 0.5;

  const wordStart = name.split(/\s+/).some(w => w.startsWith(q));
  if (wordStart) return 650 - name.length * 0.1;

  const idx = name.indexOf(q);
  return 400 - idx - name.length * 0.05;
}

export function searchStops(catalog: StopEntry[], query: string, limit = 8): StopEntry[] {
  const q = query.trim();
  if (q.length < 2) return [];

  return catalog
    .map(s => ({ s, score: rankStopMatch(s.displayName, q) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.s.displayName.length - b.s.displayName.length)
    .slice(0, limit)
    .map(x => x.s);
}

/** Auto-commit when the query clearly identifies one stop. */
export function resolveAutoSelect(suggestions: StopEntry[], query: string): StopEntry | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (suggestions.length === 1) return suggestions[0];
  return suggestions.find(s => s.displayName.toLowerCase() === q) ?? null;
}
