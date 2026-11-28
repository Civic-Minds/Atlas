import { headwayEvery, headwayEveryRange, headwayExactAmount, headwayRangeShown } from '../../shared/headwayText';
import { liveLineText, scheduleLineText, type LiveRowGap } from '../../shared/liveWording';
import { LIVE_ROW_DOT_GAP } from '../../shared/rules/live';

/** A destination row's timetable figure, as the row would show it without live vehicles. */
export type RowSchedule = { headway?: number | null; trunkHeadway?: number | null; limited?: boolean; limitedLabel?: string; /** The row's own words ("every 10 min until 5:05 PM"). */ headwayLabel?: string };

/** The shared headway wording's lead word ("every "), taken from headwayEvery itself so it is never typed here. */
const EVERY_PREFIX = headwayEvery(1).slice(0, -headwayExactAmount(1).length);

/** The minutes the live line's dot is coloured by, on the map's frequency tiers: the typical (median) live gap (LIVE_ROW_DOT_GAP). */
export function liveDotMinutes(gap: LiveRowGap): number {
  return gap[LIVE_ROW_DOT_GAP];
}

/** "schedule 10 min", "schedule 6–12 min", "schedule 10 min until 5:05 PM", or the row's own limited words where it has no regular figure. */
export function scheduleLine(s: RowSchedule): string | undefined {
  if (s.limited || s.headway == null) return s.limitedLabel;
  // The row's settled words stay whole ("until 5:05 PM", "from 4:37 PM", "with one 32 min gap"; CIV-3121, CIV-3135):
  // only the lead word changes, "every 10 min until 5:05 PM" -> "schedule 10 min until 5:05 PM".
  if (s.headwayLabel?.startsWith(EVERY_PREFIX)) return scheduleLineText(s.headwayLabel.slice(EVERY_PREFIX.length));
  const amount = headwayRangeShown(s.trunkHeadway, s.headway) ? headwayEveryRange(s.trunkHeadway, s.headway, true) : headwayExactAmount(s.headway);
  return scheduleLineText(amount);
}

/**
 * The row props for a destination with live vehicles (CIV-3158, Ryan 2026-11-28): line 1 the destination with its vehicles
 * right-aligned (labelEnd, set by the caller); line 2 the live gaps, bold, with the dot; line 3 the timetable, normal weight.
 * One builder for the map's card, Studio and Live's own rows, so "every … · gaps …" never comes back on any of them.
 */
export function liveRowValueProps(gap: LiveRowGap, s: RowSchedule) {
  const dot = liveDotMinutes(gap);
  return {
    headway: dot,
    colorHeadway: dot,
    headwayLabel: liveLineText(gap),
    trunkHeadway: undefined,
    limited: false,
    valueBelow: true,
    valueNote: scheduleLine(s),
  };
}

/** Two readings of a row's live gaps match (the callers keep their state when nothing changed). */
export const sameLiveRowGap = (a: LiveRowGap | undefined, b: LiveRowGap): boolean => !!a && a.from === b.from && a.longest === b.longest && a.median === b.median;
