import { DAY_TYPES, getNowDay, type DayType } from '../../shared/dayTypes';

/** The viewer's saved day, shared by the map and History (CIV-1433). */
export const DAY_PREF_KEY = 'atlas_pref_day';

/**
 * The day a screen opens on: the link's day, else the viewer's saved day, else today's day type.
 * The map and History both call this (CIV-1433: "the same exact logic as the main map").
 */
export function openingDay(fromLink: DayType | null | undefined): DayType {
  if (fromLink != null) return fromLink;
  try {
    const saved = localStorage.getItem(DAY_PREF_KEY);
    if (saved && (DAY_TYPES as readonly string[]).includes(saved)) return saved as DayType;
  } catch {}
  return getNowDay();
}

/** Save a day the viewer picked as their day (History's picker; the map saves through usePersistedFilterPref). */
export function saveDayPref(day: DayType): void {
  try { localStorage.setItem(DAY_PREF_KEY, day); } catch {}
}
