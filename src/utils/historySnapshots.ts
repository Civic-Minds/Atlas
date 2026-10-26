/**
 * Snapshot order and filtering for History (#1030). The published history config lists each route's
 * snapshots in date order (pipeline/build-history.ts sorts them by period date before writing), but
 * its labels are display text ("Sep 2026"), so the UI must not re-sort by label: within a year it
 * keeps the published order.
 */
interface SnapshotLike {
  label: string;
  year: number;
}

/** Newest first: by year, and within a year in the published (date) order, latest first. */
export function snapshotsNewestFirst<T extends SnapshotLike>(snapshots: readonly T[]): T[] {
  return snapshots
    .map((snapshot, index) => ({ snapshot, index }))
    .sort((a, b) => b.snapshot.year - a.snapshot.year || b.index - a.index)
    .map(({ snapshot }) => snapshot);
}

/**
 * The snapshots History shows: one with no label or a year after this one (bad upstream data such
 * as "Dec 2099") is left out, so it can never become the newest end of a change summary.
 */
export function usableSnapshots<T extends SnapshotLike>(snapshots: readonly T[], currentYear = new Date().getFullYear()): T[] {
  return snapshots.filter(s => (s.label ?? '').trim() !== '' && Number.isFinite(s.year) && s.year <= currentYear);
}
