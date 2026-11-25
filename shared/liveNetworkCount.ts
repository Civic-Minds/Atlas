/**
 * CIV-2939 (Ryan, 2026-11-25, "1": "save the whole-network vehicle count each minute for every recorded agency, TTC
 * included, and Fleet shows it as 'In service now'"). The cloud recorder counts every vehicle in an agency's positions
 * feed once a minute, before any route filter (the TTC records only some routes, CIV-2174), and keeps one small file per
 * agency per UTC day in the private atlas-live bucket: counts/{slug}/{date}.json, one [minute, vehicles] pair a minute.
 * The atlas-live-read Worker serves the latest. Positions storage is unchanged.
 */
export const LIVE_COUNT_PREFIX = 'counts';
/** How often a count is saved: one a minute. */
export const LIVE_COUNT_STEP_SEC = 60;

/** One agency's counts for one UTC day: [unix second of the minute, vehicles in the whole feed]. */
export interface LiveNetworkCountDay {
  agency: string;
  date: string;
  counts: [number, number][];
}

const utcDate = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/** The day file a minute's count goes in. */
export function liveCountKey(slug: string, sec: number): string {
  return `${LIVE_COUNT_PREFIX}/${slug}/${utcDate(sec)}.json`;
}

/** Every vehicle with a position in a decoded positions feed (gtfs-realtime-bindings toObject), whatever its route. */
export function networkVehicleCount(positions: { entity?: readonly { vehicle?: { position?: unknown } | null }[] | null }): number {
  return (positions.entity ?? []).filter(e => e.vehicle?.position != null).length;
}

/** A day file's text, or a new day when it is missing or unreadable. */
export function parseCountDay(text: string | null, slug: string, sec: number): LiveNetworkCountDay {
  const date = utcDate(sec);
  try {
    const day = text ? JSON.parse(text) as LiveNetworkCountDay : null;
    if (day && day.agency === slug && day.date === date && Array.isArray(day.counts)) return day;
  } catch { /* a new day */ }
  return { agency: slug, date, counts: [] };
}

/** The day with this minute's count added (a minute already there is replaced), in time order. */
export function addCount(day: LiveNetworkCountDay, sec: number, vehicles: number): LiveNetworkCountDay {
  const minute = sec - (sec % LIVE_COUNT_STEP_SEC);
  const counts = day.counts.filter(([t]) => t !== minute);
  counts.push([minute, vehicles]);
  counts.sort((a, b) => a[0] - b[0]);
  return { ...day, counts };
}

/** The latest count in a day, or null when the day has none. */
export function latestCount(day: LiveNetworkCountDay): { at: number; vehicles: number } | null {
  const last = day.counts.at(-1);
  return last ? { at: last[0], vehicles: last[1] } : null;
}
