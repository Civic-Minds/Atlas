export type AtlasPerformanceMark = 'app-ready' | 'agency-catalog-ready' | 'network-data-ready';

const markName = (name: AtlasPerformanceMark) => `atlas:${name}`;

export function markAtlasOnce(name: AtlasPerformanceMark): void {
  if (typeof performance === 'undefined' || performance.getEntriesByName(markName(name)).length > 0) return;
  performance.mark(markName(name));
}

/** Record the latest completion for a milestone that can happen more than once per page. */
export function markAtlasLatest(name: AtlasPerformanceMark, detail?: unknown): void {
  if (typeof performance === 'undefined') return;
  performance.clearMarks(markName(name));
  performance.mark(markName(name), { detail });
}

export function getAtlasMark(name: AtlasPerformanceMark): number | null {
  if (typeof performance === 'undefined') return null;
  const entry = performance.getEntriesByName(markName(name)).at(-1);
  return entry?.startTime ?? null;
}
