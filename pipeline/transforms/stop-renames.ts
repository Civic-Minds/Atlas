import type { GtfsData } from '../../types/gtfs.js';

/**
 * CIV-3021 (#1855; Ryan, 2026-11-26, option 1: "A hand-checked TTC rename list, which also fixes TMU/Cedarvale"): an
 * agency's hand-checked stop renames. Each entry names one stop and the exact name the feed gives it; the stop takes the
 * new name only while the feed still says `from`, so a feed that fixes or changes the name is left as published and the
 * entry shows up as stale. No general rule: every rename is listed and checked by hand.
 */
export interface StopRename {
  stopId: string;
  /** The feed's stop_name, exactly. */
  from: string;
  to: string;
}

export interface StopRenameResult {
  gtfs: GtfsData;
  renamed: number;
  /** Entries whose stop is missing or whose feed name is no longer `from`. */
  stale: StopRename[];
}

export function renameStops(gtfs: GtfsData, renames: readonly StopRename[]): StopRenameResult {
  const byId = new Map(renames.map(r => [r.stopId, r]));
  const applied = new Set<string>();
  const stops = (gtfs.stops ?? []).map(stop => {
    const r = byId.get(stop.stop_id);
    if (!r || stop.stop_name !== r.from) return stop;
    applied.add(r.stopId);
    return { ...stop, stop_name: r.to };
  });
  return { gtfs: { ...gtfs, stops }, renamed: applied.size, stale: renames.filter(r => !applied.has(r.stopId)) };
}
