export type AtlasPerformanceMark = 'network-data-ready';

const markName = (name: AtlasPerformanceMark) => `atlas:${name}`;

/** Record the latest point at which a user-visible Atlas milestone became true. */
export function markAtlasLatest(name: AtlasPerformanceMark, detail?: unknown): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;

  performance.clearMarks(markName(name));
  performance.mark(markName(name), detail === undefined ? undefined : { detail });
}
