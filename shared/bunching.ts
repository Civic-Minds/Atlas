/**
 * B4: where and why bunching forms along a route, from the gaps between consecutive vehicles at each stop.
 * Where: the share of gaps under two minutes (bunched) plus gaps over twice the scheduled gap (gapped), stop by stop;
 * bunching forms at the largest step up in that share that stays up for the next few stops (a slow climb with no such step is gradual). Why: which measured things sit at that stretch
 * ("linked to", never "caused by"): uneven departures at the terminal, vehicles standing still, slow running vs the
 * timetable, short turns. Pure functions; scripts/live-segment-delay.ts feeds them.
 */
import { median, percentile } from './segmentDelay.js';

export const BUNCHED_GAP_SEC = 120;
export const GAPPED_FACTOR = 2;
/** A stop needs this many gaps before it counts. */
export const MIN_GAPS = 30;
/** A rise counts as a step (bunching "forms" there) when the bad share jumps by at least this much (0.10 = 10 points)... */
export const RISE = 0.1;
/** ...and the stops after it stay up: each is at least half the rise above where it started... */
export const STAYS_UP_SHARE = 0.5;
/** ...for at least the next 3 stops or about 1 km, whichever is longer. Recovering later (terminal regulation, short turns) does not undo where it formed. */
export const STAYS_UP_STOPS = 3;
export const STAYS_UP_M = 1000;
/** The baseline is the mean bad share over this many first stops with enough gaps. */
export const BASELINE_STOPS = 3;
/** Smaller climbs than RISE that add up to at least this much over the route are called gradual. */
export const GRADUAL_CLIMB = 0.05;

export interface GapWindow {
  /** Seconds between consecutive vehicles passing the stop, in one (date, band) window. */
  actualGaps: number[];
  /** The timetable's gaps for the same window, seconds. */
  scheduledGaps: number[];
}

export interface StopBunching {
  stopId: string;
  n: number;
  bunchedShare: number;
  gappedShare: number;
  /** bunchedShare + gappedShare: gaps that are not near the timetable's. */
  badShare: number;
  medianGapSec: number | null;
  /** Metres along the route (optional): lets "stays up" look about 1 km ahead as well as 3 stops. */
  alongM?: number;
  /** 90th over 10th percentile of the gaps: how spread out they are. */
  spread: number | null;
}

export function stopBunching(stopId: string, windows: readonly GapWindow[]): StopBunching {
  let n = 0, bunched = 0, gapped = 0;
  const all: number[] = [];
  for (const w of windows) {
    const sched = median(w.scheduledGaps);
    for (const g of w.actualGaps) {
      n++; all.push(g);
      if (g < BUNCHED_GAP_SEC) bunched++;
      else if (sched != null && g > GAPPED_FACTOR * sched) gapped++;
    }
  }
  const p10 = percentile(all, 0.1);
  const p90 = percentile(all, 0.9);
  return {
    stopId, n, bunchedShare: n ? bunched / n : 0, gappedShare: n ? gapped / n : 0, badShare: n ? (bunched + gapped) / n : 0,
    medianGapSec: median(all), spread: p10 && p90 ? p90 / p10 : null,
  };
}

export interface BunchingStretch {
  fromStopId: string;
  toStopId: string;
  /** Rise in bad share from the first stop to the second, in points of 1 (0.08 = 8 points). */
  rise: number;
  fromBadShare: number;
  toBadShare: number;
}

export interface BunchingProfile {
  /** Mean bad share over the first stops with enough gaps (the terminal end). */
  baselineBadShare: number | null;
  /**
   * 'forms': one stretch where the bad share steps up by RISE or more and stays up for the next 3 stops or 1 km.
   * 'gradual': no such step, but the bad share still climbs by GRADUAL_CLIMB or more along the route.
   * 'none': flat. Null when there are too few stops with enough gaps.
   */
  kind: 'forms' | 'gradual' | 'none' | null;
  /** The largest rise that stays up (kind 'forms'), or null. */
  forms: BunchingStretch | null;
  /** The stretch with the largest single rise, whether or not it stays up. */
  biggestRise: BunchingStretch | null;
  /** Highest bad share after the baseline minus the baseline: how far it climbs overall. */
  climb: number | null;
}

/** `stops` in travel order. Stops with fewer than MIN_GAPS gaps are skipped. The full per-stop profile is shown beside this. */
export function bunchingProfile(stops: readonly StopBunching[]): BunchingProfile {
  const usable = stops.filter(s => s.n >= MIN_GAPS);
  if (usable.length < BASELINE_STOPS + 1) return { baselineBadShare: null, kind: null, forms: null, biggestRise: null, climb: null };
  const baseline = usable.slice(0, BASELINE_STOPS).reduce((a, s) => a + s.badShare, 0) / BASELINE_STOPS;
  const stretchAt = (i: number): BunchingStretch => ({
    fromStopId: usable[i - 1].stopId, toStopId: usable[i].stopId, rise: usable[i].badShare - usable[i - 1].badShare,
    fromBadShare: usable[i - 1].badShare, toBadShare: usable[i].badShare,
  });
  let forms: BunchingStretch | null = null;
  let biggest: BunchingStretch | null = null;
  for (let i = 1; i < usable.length; i++) {
    const s = stretchAt(i);
    if (!biggest || s.rise > biggest.rise) biggest = s;
    if (s.rise < RISE) continue;
    let end = Math.min(usable.length, i + STAYS_UP_STOPS);
    const a0 = usable[i].alongM;
    if (a0 != null) while (end < usable.length && (usable[end - 1].alongM ?? a0) < a0 + STAYS_UP_M) end++;
    const staysUp = usable.slice(i, end).every(f => f.badShare >= s.fromBadShare + STAYS_UP_SHARE * s.rise);
    if (staysUp && (!forms || s.rise > forms.rise)) forms = s;
  }
  const climb = Math.max(...usable.slice(BASELINE_STOPS).map(s => s.badShare)) - baseline;
  const kind = forms ? 'forms' : climb >= GRADUAL_CLIMB ? 'gradual' : 'none';
  return { baselineBadShare: baseline, kind, forms, biggestRise: biggest && biggest.rise > 0 ? biggest : null, climb };
}

/** Evidence near a stretch, from the other analysis blocks. Each is optional: absent means "not measured". */
export interface BunchingEvidence {
  /** Bad share at the terminal (first stop) and the scheduled bad share there is 0 by definition. */
  terminalBadShare: number | null;
  /** Stood-still events per day and total minutes per day over the stretch's own stops (not the stops before it). */
  standStill: { eventsPerDay: number; minutesPerDay: number } | null;
  /** The slowest segment's median running time minus the timetable's, seconds, within the stretch (segments touching a terminal are left out: they include the layover). */
  slowestSegment: { fromStopId: string; toStopId: string; gainedSec: number } | null;
  /** Short-turned trips per day at those stops. */
  shortTurnsPerDay: number | null;
}

export const LINK_TERMINAL_BAD_SHARE = 0.2;
export const LINK_STAND_STILL_EVENTS_PER_DAY = 0.5;
export const LINK_SLOW_SEGMENT_SEC = 30;
export const LINK_SHORT_TURNS_PER_DAY = 0.5;

export type BunchingLinkKind = 'terminal_departures' | 'stood_still' | 'slow_stretch' | 'short_turns';

export interface BunchingLink {
  kind: BunchingLinkKind;
  /** True when the number passes the linking threshold; false rows are shown as "not linked" with their number. */
  linked: boolean;
  value: number | null;
}

/** Which measured things line up with a bunching stretch. "Linked to", never a verdict that it caused the bunching. */
export function bunchingLinks(e: BunchingEvidence): BunchingLink[] {
  return [
    { kind: 'terminal_departures', linked: e.terminalBadShare != null && e.terminalBadShare >= LINK_TERMINAL_BAD_SHARE, value: e.terminalBadShare },
    { kind: 'stood_still', linked: e.standStill != null && e.standStill.eventsPerDay >= LINK_STAND_STILL_EVENTS_PER_DAY, value: e.standStill?.eventsPerDay ?? null },
    { kind: 'slow_stretch', linked: e.slowestSegment != null && e.slowestSegment.gainedSec >= LINK_SLOW_SEGMENT_SEC, value: e.slowestSegment?.gainedSec ?? null },
    { kind: 'short_turns', linked: e.shortTurnsPerDay != null && e.shortTurnsPerDay >= LINK_SHORT_TURNS_PER_DAY, value: e.shortTurnsPerDay },
  ];
}
