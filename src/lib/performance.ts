export type AtlasPerformanceMark = 'app-ready' | 'agency-catalog-ready' | 'network-data-ready';

const markName = (name: AtlasPerformanceMark) => `atlas:${name}`;

export function markAtlasOnce(name: AtlasPerformanceMark): void {
  if (typeof performance === 'undefined' || performance.getEntriesByName(markName(name)).length > 0) return;
  performance.mark(markName(name));
}

export function getAtlasMark(name: AtlasPerformanceMark): number | null {
  if (typeof performance === 'undefined') return null;
  const entry = performance.getEntriesByName(markName(name)).at(-1);
  return entry?.startTime ?? null;
}
