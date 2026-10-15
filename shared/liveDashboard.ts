/**
 * Live route dashboard (B1-B4): the page and the card read the same analysis file (`v3` block written by
 * scripts/live-segment-delay.ts), through /api/live-dashboard. Types for that block, which routes are held back, and
 * the plain-language sentences, so the page and the tests share one wording.
 */
import { hasLiveAnalysis } from './livePollingConfig.js';

export interface AdherenceCounts {
  n: number;
  early: number; onTime: number; late: number;
  earlyShare: number; onTimeShare: number; lateShare: number; notLateShare: number;
}
export interface AdherenceBlock {
  overall: AdherenceCounts;
  byHour: Array<{ hour: number } & AdherenceCounts>;
  byDate: Array<{ date: string } & AdherenceCounts>;
  byDirection: Record<string, AdherenceCounts>;
}
export interface DashboardStop {
  stopId: string; name: string; directionId: number; order: number; n: number;
  medianMin: number; p90Min: number; lateShare: number; earlyShare: number; ranked: boolean; lateRank?: number;
}
export interface DashboardStretch {
  fromStopId: string; toStopId: string; fromName: string; toName: string;
  n: number; medianAddedMin: number; addedShare: number;
  /** Share of trips where delay grew by 30+ seconds across this stretch: how consistent the build-up is. */
  growShare: number;
  medianDelayMin: number; p10DelayMin: number; p90DelayMin: number;
}
export interface DashboardBuildup {
  directionId: number; startingDelayMin: number | null;
  kind: 'forms' | 'gradual' | 'none' | null;
  /** The stretch with the largest added delay that stays up for the next 3 stops / 1 km. */
  forms: DashboardStretch | null;
  /** Median delay at the end of the route minus at its start, minutes. */
  climbMin: number | null;
  start: DashboardStretch | null; biggest: DashboardStretch | null; stretches: DashboardStretch[];
}
/** Time-of-day keys: the whole day, then the map's periods. */
export type DashboardBand = 'all' | 'amPeak' | 'midday' | 'pmPeak' | 'evening';
export interface DashboardBandData {
  stops: DashboardStop[];
  buildup: DashboardBuildup[];
  adherence: LiveV3['adherence'];
}
export type BunchingLinkKind = 'terminal_departures' | 'stood_still' | 'slow_stretch' | 'short_turns';
export interface DashboardBunchingStretch {
  fromStopId: string; toStopId: string; fromName: string; toName: string;
  rise: number; fromBadShare: number; toBadShare: number;
  links: Array<{ kind: BunchingLinkKind; linked: boolean; value: number | null }>;
}
export interface DashboardBunchingBand {
  baselineBadShare: number | null;
  kind: 'forms' | 'gradual' | 'none' | null;
  climb: number | null;
  forms: DashboardBunchingStretch | null;
  biggestRise: DashboardBunchingStretch | null;
  stops: Array<{ stopId: string; name: string; order: number; n: number; badShare: number; bunchedShare: number; gappedShare: number; medianGapSec: number | null }>;
}
export interface LiveV3 {
  schema: 3;
  window: { days: number; dates: string[]; requestedDays: number };
  thresholds: { earlyAtOrBelowMin: number; lateAtOrAboveMin: number; bunchedGapSec: number };
  method: string;
  swaps: { reassigned: number; dropped: number; rate: number };
  uncertainty: { nearCutoffShare: number; withinMin: number; note: string };
  totals: { runs: number; stopPassages: number; droppedOffTimetable: number };
  directionLabels: Record<string, string>;
  adherence: {
    timepoints: { all: AdherenceBlock; weekday: AdherenceBlock; weekend: AdherenceBlock };
    allStops: { all: AdherenceBlock; weekday: AdherenceBlock; weekend: AdherenceBlock };
  };
  stops: DashboardStop[];
  buildup: DashboardBuildup[];
  /** Stops, build-up and adherence for each time of day. The top-level `adherence`, `stops` and `buildup` are the 'all' entry. */
  bands: Record<DashboardBand, DashboardBandData>;
  bunching: Array<{ directionId: number; bands: Record<string, DashboardBunchingBand> }>;
}

/** What /api/live-dashboard answers. `reason` is always a plain sentence that says what to do or when it will exist. */
export type LiveDashboardResponse =
  | { status: 'ready'; agency: string; route: string; generatedAt: string; replacementBuses: boolean; v3: LiveV3; note: string | null; /** Directions whose first stops are measured poorly (see `note`), and how many stops are affected. */ uncertainStart: UncertainStart[] }
  | { status: 'held' | 'no_analysis' | 'unknown_route'; reason: string };

/** Routes whose analysis is built but not shown until a known problem is fixed. */
export const LIVE_DASHBOARD_HOLD: Readonly<Record<string, string>> = {
  'ttc::501': 'The 501 is not shown yet: about a quarter of the vehicles on it are buses that are not on the timetable (on Queen West), so its delays and gaps would be overstated until they are separated out.',
  'ttc::506': 'The 506 is not shown yet: its timetable mixes the streetcar with a replacement bus under one route, so its line and gaps blend both.',
  'ttc::512': 'The 512 is held back: about 15% of its trips run under a trip number that does not match the timetable, so its delays cannot be trusted yet.',
};

/** Things to know when reading one route's numbers. */
export const LIVE_DASHBOARD_NOTES: Readonly<Record<string, string>> = {
  'ttc::510': 'Delay at the first few stops is less exact (about 2–3 min late), because streetcars report their location less often in the Union Station tunnel.',
};

export interface UncertainStart { directionId: number; stops: number }
/** Directions whose delay at the first few stops is less exact: the page notes it and leaves those stops out of the ranking. */
export const LIVE_DASHBOARD_UNCERTAIN_START: Readonly<Record<string, readonly UncertainStart[]>> = { 'ttc::510': [{ directionId: 1, stops: 4 }] };

export function dashboardHold(agency: string, route: string): string | null {
  return LIVE_DASHBOARD_HOLD[`${agency}::${route}`] ?? null;
}

/** Why the dashboard has nothing for this route, or null when it should. */
export function dashboardUnavailable(agency: string, route: string): { status: 'held' | 'no_analysis' | 'unknown_route'; reason: string } | null {
  const hold = dashboardHold(agency, route);
  if (hold) return { status: 'held', reason: hold };
  if (!hasLiveAnalysis(agency, route)) {
    return { status: 'no_analysis', reason: `No analysis is built for ${agency.toUpperCase()} ${route} yet. It needs saved vehicle locations and the timetable for the route; build it with "npm run live:analyze -- ${route}".` };
  }
  return null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const min = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 10) / 10} min`;

/** B3: one sentence per direction. */
export function buildupSentence(label: string, b: DashboardBuildup): string {
  if (b.kind === 'forms' && b.forms) {
    return `${label}: delay builds up between ${b.forms.fromName} and ${b.forms.toName}: ${min(b.forms.medianAddedMin)} added there, and it stays up for the next few stops. Delay grows by 30+ seconds on ${pct(b.forms.growShare)} of ${b.forms.n.toLocaleString()} trips.`;
  }
  if (b.kind === 'gradual') {
    return `${label}: delay builds gradually along the route${b.climbMin != null ? ` (${min(b.climbMin)} from start to end)` : ''}. No single stretch stands out.`;
  }
  if (b.kind === 'none') return `${label}: delay does not build up along the route.`;
  return `${label}: too few trips to say where delay builds up.`;
}

/** B4: one sentence per direction and period. "Linked to", never "caused by". */
export function bunchingSentence(label: string, b: DashboardBunchingBand): string {
  if (b.kind == null) return `${label}: too few measured stops to say where bunching forms.`;
  const first = b.stops.find(s => s.n >= 30);
  if (b.kind === 'forms' && b.forms) {
    return `${label}: bunching forms between ${b.forms.fromName} and ${b.forms.toName}: gaps that are too short or too long go from ${pct(b.forms.fromBadShare)} to ${pct(b.forms.toBadShare)} (${Math.round(b.forms.rise * 100)} points) and stay up.`;
  }
  if (b.kind === 'gradual') {
    const top = b.stops.filter(s => s.n >= 30).reduce((m, s) => Math.max(m, s.badShare), 0);
    return `${label}: bunching builds gradually, from ${first ? pct(first.badShare) : 'the start'} at the first measured stop to ${pct(top)} at its highest. No single stretch steps up by 10 points.`;
  }
  return `${label}: gaps stay close to the timetable along the route.`;
}

export const LINK_LABELS: Record<BunchingLinkKind, string> = {
  terminal_departures: 'Uneven departures at the terminal',
  stood_still: 'Vehicles standing still in this stretch',
  slow_stretch: 'Running slower than the timetable in this stretch',
  short_turns: 'Trips cut short in this stretch',
};

export function linkValueText(kind: BunchingLinkKind, value: number | null): string {
  if (value == null) return 'not measured';
  if (kind === 'terminal_departures') return `${pct(value)} of gaps off`;
  if (kind === 'stood_still') return `${Math.round(value * 10) / 10} a day`;
  if (kind === 'slow_stretch') return `${value >= 0 ? '+' : ''}${Math.round(value)} s vs timetable`;
  return `${Math.round(value * 10) / 10} a day`;
}

/** B2: stops ranked by late share among those with enough departures, for the chosen direction (null = both). */
export function rankStops(stops: readonly DashboardStop[], directionId: number | null, uncertain: readonly UncertainStart[] = []): DashboardStop[] {
  const lessExact = (s: DashboardStop) => uncertain.some(u => u.directionId === s.directionId && s.order >= 0 && s.order < u.stops);
  return stops
    .filter(s => s.ranked && !lessExact(s) && (directionId == null || s.directionId === directionId))
    .sort((a, b) => b.lateShare - a.lateShare || b.n - a.n);
}

export interface CardSummary {
  /** Share of timepoint departures that are late (5.5+ min), with the count it is out of. */
  late: { share: number; n: number } | null;
  /** The stop where the most cars leave late (ranked stops only). */
  worstStop: { name: string; lateShare: number; n: number } | null;
  /** Where delays start, as one sentence, or null when no stretch adds more than a minute in half the runs. */
  startsText: string | null;
}

/** The three short facts on the route card (one direction), from the same file the page reads. */
export function cardSummary(v3: LiveV3, directionId: number, uncertain: readonly UncertainStart[] = []): CardSummary {
  const counts = v3.adherence.timepoints.all.byDirection[String(directionId)];
  const worst = rankStops(v3.stops, directionId, uncertain)[0];
  const build = v3.buildup.find(b => b.directionId === directionId);
  const start = build?.kind === 'forms' ? build.forms : null;
  return {
    late: counts && counts.n > 0 ? { share: counts.lateShare, n: counts.n } : null,
    worstStop: worst ? { name: worst.name, lateShare: worst.lateShare, n: worst.n } : null,
    startsText: start ? `${start.fromName} to ${start.toName} (${min(start.medianAddedMin)}, on ${pct(start.growShare)} of trips)` : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 8–14", or "Sep 30–Oct 14" across months, from two YYYY-MM-DD dates. */
export function dateRangeText(first: string, last: string): string {
  const [, m1, d1] = first.split('-').map(Number);
  const [, m2, d2] = last.split('-').map(Number);
  if (first === last) return `${MONTHS[m1 - 1]} ${d1}`;
  return m1 === m2 ? `${MONTHS[m1 - 1]} ${d1}–${d2}` : `${MONTHS[m1 - 1]} ${d1}–${MONTHS[m2 - 1]} ${d2}`;
}

/** The analysis is "stale" once its newest day is more than this many days old. */
export const STALE_AFTER_DAYS = 2;

export interface Freshness {
  /** Newest service date in the window (YYYY-MM-DD). */
  upTo: string | null;
  daysOld: number | null;
  stale: boolean;
  /** Plain sentence for the page; for a stale analysis it also says how to rebuild. */
  text: string;
}

/** "Data up to <date>", and a warning when it is more than two days old. `route` is for the rebuild command. */
export function freshness(v3: LiveV3, route: string, now: number): Freshness {
  const upTo = v3.window.dates[v3.window.dates.length - 1] ?? null;
  if (!upTo) return { upTo: null, daysOld: null, stale: true, text: `This analysis has no days in it. Rebuild it with "npm run live:analyze -- ${route}".` };
  const daysOld = Math.floor((now - Date.parse(`${upTo}T12:00:00Z`)) / 86_400_000);
  const stale = daysOld > STALE_AFTER_DAYS;
  return {
    upTo, daysOld, stale,
    text: stale
      ? `Data up to ${upTo}, ${daysOld} days ago. Rebuild it with "npm run live:analyze -- ${route}" (needs fresh saved vehicle locations).`
      : `Data up to ${upTo}.`,
  };
}

/** One CSV cell: quoted when it holds a comma, quote or line break. */
const cell = (v: string | number | null) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Rows as CSV text (for the table downloads): a header line, then one line per row. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return [header, ...rows].map(r => r.map(cell).join(',')).join('\n') + '\n';
}
