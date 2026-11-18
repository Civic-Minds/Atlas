/**
 * Which figures in an old schedule are doubtful (CIV-1847): a part of the day whose wait is a quarter or less of the
 * typical wait at the schedule's other times of day. Kingston 12's January 2019 midday "every 5", when the rest of that
 * schedule runs every 24–30, is the case it catches (most likely two copies of a service counted together, #1580).
 * Decided 2026-11-18 (manager, after Ryan said Kingston 12 never ran that often): compare within the same old schedule
 * only, never against today, so a real service cut (10 then, 30 now) is left alone; a schedule with only one time of
 * day is never flagged. Shared so the MCP's route_history and Studio's History read the same rule.
 */

/** A figure is doubtful at this share or less of the schedule's typical wait at its other times of day. */
export const DOUBTFUL_SHARE_OF_TYPICAL = 0.25;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The parts of the day whose figure is doubtful in one schedule. `waits` holds each part's wait in minutes (null or
 * absent where there is no figure). The typical wait is the median of the other parts' waits.
 */
export function doubtfulParts<K extends string>(waits: Partial<Record<K, number | null>>): Set<K> {
  const entries = (Object.entries(waits) as Array<[K, number | null | undefined]>).filter((e): e is [K, number] => e[1] != null);
  const out = new Set<K>();
  if (entries.length < 2) return out;
  for (const [k, v] of entries) {
    const typical = median(entries.filter(([o]) => o !== k).map(([, w]) => w));
    if (v <= DOUBTFUL_SHARE_OF_TYPICAL * typical) out.add(k);
  }
  return out;
}
