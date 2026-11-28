import { headwayEveryRange, headwayExactAmount, headwayRangeShown } from '../../shared/headwayText';
import { liveLineText, scheduleLineText, type LiveRowGap } from '../../shared/liveWording';
import { LIVE_ROW_DOT_GAP } from '../../shared/rules/live';

/** A destination row's timetable figure, as the row would show it without live vehicles. */
export type RowSchedule = { headway?: number | null; trunkHeadway?: number | null; limited?: boolean; limitedLabel?: string };

/** The minutes the live line's dot is coloured by, on the map's frequency tiers (LIVE_ROW_DOT_GAP; Ryan still to pick). */
export function liveDotMinutes(gap: LiveRowGap): number {
  return gap[LIVE_ROW_DOT_GAP];
}

/** "schedule 10 min", "schedule 6–12 min", or the row's own limited words where it has no regular figure. */
export function scheduleLine(s: RowSchedule): string | undefined {
  if (s.limited || s.headway == null) return s.limitedLabel;
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
export const sameLiveRowGap = (a: LiveRowGap | undefined, b: LiveRowGap): boolean => !!a && a.from === b.from && a.longest === b.longest;
