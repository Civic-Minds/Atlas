/**
 * #1523: the one clock the pipeline reads "today" from. ATLAS_RUN_AT (an ISO time, e.g.
 * 2026-11-15T04:00:00Z) pins it, so a dry-run pair (rebuild-release.yml's run_at input) or a local
 * before/after pair reads the same service day even when the two runs straddle midnight: #1514's
 * base (23:40 Toronto) and fix (01:42) runs read the same zips and still differed in CTA, Kingston,
 * Thunder Bay and Valley Metro. Unset, it is the real clock. In the browser there is no process, so
 * the site always reads the real clock.
 */
export function runNow(): Date {
  const pinned = typeof process !== 'undefined' ? process.env?.ATLAS_RUN_AT : undefined;
  if (!pinned) return new Date();
  const at = new Date(pinned);
  if (Number.isNaN(at.getTime())) throw new Error(`ATLAS_RUN_AT is not a date: ${pinned}`);
  return at;
}
