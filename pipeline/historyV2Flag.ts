/**
 * The one switch for every History v2 behaviour: ATLAS_HISTORY_V2=1.
 * Unset (the weekly refresh-feeds cron) means the published history output is exactly what
 * origin/main produces. A tiny file of its own so the key function can read it without a cycle.
 */
import { historyV2Enabled } from '../shared/rules/flags.js';

// The switch's rule lives in shared/rules/flags.ts (rules audit, move 10); this file reads the env.
export { historyV2Enabled };

/**
 * CIV-1425 pilot: agencies whose History v2 sidecars also store Saturday/Sunday per-period values.
 * ATLAS_HISTORY_WEEKEND_PERIODS is a comma list of slugs (e.g. "mbta"); unset = none, so every
 * other agency's sidecar stays byte-identical.
 */
export function historyWeekendPeriodsFor(slug: string, envValue: string | undefined = process.env.ATLAS_HISTORY_WEEKEND_PERIODS): boolean {
  return (envValue ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(slug);
}

/** True when this process was started with ATLAS_HISTORY_V2=1. */
export function historyV2FromEnv(): boolean {
  return historyV2Enabled(process.env.ATLAS_HISTORY_V2);
}

/** #1703: how many snapshots in a published history-config.json came from v2 sidecars (`v2: true`); 0 for unreadable text. */
export function v2SnapshotCount(body: string): number {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return 0; }
  if (!Array.isArray(data)) return 0;
  let n = 0;
  for (const agency of data) {
    for (const route of (agency as { routes?: unknown[] })?.routes ?? []) {
      for (const snap of (route as { snapshots?: unknown[] })?.snapshots ?? []) if ((snap as { v2?: unknown })?.v2 === true) n++;
    }
  }
  return n;
}

/**
 * #1703: a build without ATLAS_HISTORY_V2=1 writes the v1 config over the whole live file. When the live file holds v2
 * snapshots, that silently drops every agency and route that only v2 sidecars carry (TTC and CTA on 2026-11-22). Returns
 * the refusal to print, or null when the build may write. Undoing v2 on purpose is history:restore's job, not a build's.
 */
export function v1OverV2Refusal(v2: boolean, liveBody: string | null): string | null {
  if (v2 || liveBody == null) return null;
  const n = v2SnapshotCount(liveBody);
  if (n === 0) return null;
  return `Refusing to publish: the live history-config.json has ${n} History v2 snapshots and this build has no ATLAS_HISTORY_V2=1, so it would replace them with the v1 output (#1703). Run with ATLAS_HISTORY_V2=1, or use npm run history:restore to put an earlier file back.`;
}
