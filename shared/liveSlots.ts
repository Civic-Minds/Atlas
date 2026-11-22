/**
 * CIV-2073: the recorder's clock. Each feed is polled at the boundaries of its own pace, floor(t / paceSec) * paceSec,
 * and each boundary is also its snapshot's key time, so the recorder keeps no state between runs and a reader can work
 * out every key from the clock alone (no R2 LIST, which is a Class A operation).
 */

/** The live v2 snapshot prefix: one object per agency per pace slot. */
export const LIVE_V2_PREFIX = 'live';

/** The key of an agency's snapshot for the slot starting at `slotSec` (unix seconds): live/{slug}/{UTC date}/{slotSec}.json. */
export function liveSlotKey(slug: string, slotSec: number): string {
  return `${LIVE_V2_PREFIX}/${slug}/${new Date(slotSec * 1000).toISOString().slice(0, 10)}/${slotSec}.json`;
}

/** The slot an instant falls in. */
export const slotOf = (sec: number, paceSec: number): number => Math.floor(sec / paceSec) * paceSec;

/**
 * The slot boundaries one cron run polls: every multiple of `paceSec` in [runStartSec, runStartSec + windowSec). A run
 * fires each minute (cron's finest step), so a 30 s feed polls twice a run and a 90 s feed only in the runs a boundary
 * falls in.
 */
export function slotsInRun(runStartSec: number, paceSec: number, windowSec = 60): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(runStartSec / paceSec) * paceSec; t < runStartSec + windowSec; t += paceSec) out.push(t);
  return out;
}

/** The slots from `toSec` back to `fromSec`, newest first: what a reader GETs for a window, or (a few) for the latest. */
export function slotsBack(toSec: number, fromSec: number, paceSec: number): number[] {
  const out: number[] = [];
  for (let t = slotOf(toSec, paceSec); t >= fromSec; t -= paceSec) out.push(t);
  return out;
}
