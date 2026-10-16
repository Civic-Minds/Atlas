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
/** The run of stops every regular pattern serves, trimmed to stops measured reliably; short turns count. */
export interface RunTimeStretch { fromStopId: string; toStopId: string; fromName: string; toName: string; stops: number; fullRoute: boolean; mainPatternTrips: number; trips: number }
/** "Run time from Spadina Station to Queens Quay, all trips", or null for an older file. */
export function runTimeStretchLabel(s: RunTimeStretch | undefined, nice: (name: string) => string = x => x): string | null {
  return s ? `Run time from ${nice(s.fromName)} to ${nice(s.toName)}, all trips` : null;
}
export interface RunTimeFigures { n: number; scheduledMin: number; typicalMin: number; p90Min: number; overMin: number }
export interface WeekMetrics {
  days: number;
  dates: string[];
  healthyDates: string[];
  late: { share: number; n: number } | null;
  tripTime: { n: number; scheduledMin: number; typicalMin: number; overMin: number } | null;
  extraWait: { minutes: number; gaps: number } | null;
  bunching: { share: number; gaps: number } | null;
  delivered: { share: number; seen: number; notSeen: number; unknown: number } | null;
}
export interface DeliveredFigures { seen: number; notSeen: number; unknown: number; share: number | null }
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
  /** Runs the analysis does not use, with why (old files do not have this). */
  leftOut?: { noTimetableTrip: number; excluded: number; excludedLabel: string | null; kept: number };
  uncertainty: { nearCutoffShare: number; withinMin: number; note: string };
  totals: { runs: number; stopPassages: number; droppedOffTimetable: number };
  directionLabels: Record<string, string>;
  adherence: {
    timepoints: { all: AdherenceBlock; weekday: AdherenceBlock; weekend: AdherenceBlock };
    allStops: { all: AdherenceBlock; weekday: AdherenceBlock; weekend: AdherenceBlock };
  };
  stops: DashboardStop[];
  buildup: DashboardBuildup[];
  /** Running time against the timetable, by time of day then direction; `null` where no trip was measured. */
  runningTime?: {
    /** Per direction, the stops run time is measured between (older files measure the main pattern end to end). */
    stretch?: Record<string, RunTimeStretch>;
    bands: Record<DashboardBand, Record<string, RunTimeFigures | null>>;
    byHour: Record<string, Array<{ hour: number } & RunTimeFigures>>;
  };
  /** Extra wait at stops where service is every 15 minutes or better, by time of day. */
  extraWait?: Record<DashboardBand, Array<{ directionId: number; stopId: string; name: string; order: number; scheduledGapMin: number; extraWaitMin: number; gaps: number }>>;
  serviceDelivered?: {
    byDay: Array<{ date: string; healthy: boolean; share: number | null; seen: number; notSeen: number; unknown: number; byDirection: Record<string, number | null> }>;
    overall: DeliveredFigures & { byDirection: Record<string, DeliveredFigures> };
  };
  weekly?: { minHealthyDays: number; health: Array<{ date: string; snapshots: number; healthy: boolean }>; thisWeek: WeekMetrics; lastWeek: WeekMetrics; comparable: boolean };
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

/** B3's one-line takeaway above the chart: what the bars show, in the chart's own terms. */
export function buildupTakeaway(b: DashboardBuildup, lessExactStops = 0): string {
  // The start is read at the first stop measured well (510 northbound's first stops are in the tunnel).
  const first = b.stretches.find((s, i) => s.n >= 30 && i >= Math.max(0, lessExactStops - 1)) ?? b.stretches[0];
  const last = [...b.stretches].reverse().find(s => s.n >= 30) ?? b.stretches[b.stretches.length - 1];
  const ends = first && last ? ` (${min(first.medianDelayMin)} at the start, ${min(last.medianDelayMin)} at the end)` : '';
  if (b.kind === 'forms' && b.forms) return `Delay jumps by ${min(b.forms.medianAddedMin)} between ${b.forms.fromName} and ${b.forms.toName}, and stays up${ends}.`;
  if (b.kind === 'gradual') return `Delay builds slowly along the route; no single stretch stands out${ends}.`;
  if (b.kind === 'none') return `Delay stays about the same from end to end${ends}.`;
  return 'Too few trips to say where delay builds up.';
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

// --- running time, extra wait, service delivered and the week-over-week comparison ---

const m1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('-', '\u2212');
const hourName = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 < 12 ? 'am' : 'pm'}`;

/** "Scheduled 22 min · usually 27 · 1 in 10 over 34 min" (with the hour when one is given). */
export function runningTimeSentence(label: string, r: RunTimeFigures | null | undefined, atHour?: number): string {
  if (!r) return `${label}: too few trips were measured over the main stretch to say. Rebuilding the analysis with npm run live:analyze measures them.`;
  if (r.n < 30) return `${label}: too few trips (${r.n}) were measured from end to end to say.`;
  return `${label}: scheduled ${Math.round(r.scheduledMin)} min · usually ${Math.round(r.typicalMin)} · 1 in 10 over ${Math.round(r.p90Min)} min${atHour != null ? ` at ${hourName(atHour)}` : ''}.`;
}

/** The stop where riders wait longest, as a sentence; null when no stop has service every 15 minutes or better. */
export function extraWaitSentence(stops: ReadonlyArray<{ name: string; extraWaitMin: number; gaps: number }>, directionLabel: string): string | null {
  const ranked = stops.filter(s => s.gaps >= 30).sort((a, b) => b.extraWaitMin - a.extraWaitMin);
  const top = ranked[0];
  if (!top) return null;
  if (top.extraWaitMin < 0.5) return `${directionLabel}: riders wait about as long as the timetable promises at every stop.`;
  return `${directionLabel}: riders at ${top.name} wait about ${m1(Math.round(top.extraWaitMin * 2) / 2)} min longer than scheduled.`;
}

/** "96% of scheduled trips ran" with how it was counted, in plain words. */
export function deliveredSentence(d: DeliveredFigures, label?: string): string {
  if (d.share == null) return `${label ? `${label}: ` : ''}not enough days of recordings to say how many scheduled trips ran.`;
  return `${label ? `${label}: ` : ''}${m1(Math.round(d.share * 1000) / 10)}% of scheduled trips ran (${d.seen.toLocaleString()} of ${(d.seen + d.notSeen).toLocaleString()} that we can judge).`;
}

export type CompareKey = 'late' | 'tripTime' | 'extraWait' | 'bunching' | 'delivered';

/** One comparison line per measure, this week against last, with a plain up or down. The same rule for every measure. */
/**
 * The week-change colouring rule, shared by the dashboard (src/utils/liveKpi.ts) and the full analysis page, so both
 * always agree. A change is coloured only when it is bigger than normal noise. Where the file holds a value per day
 * (late share, trips that ran), the noise is measured: twice the standard error of the difference of the two weekly
 * means, from the day-to-day spread (dailyNoise). Elsewhere a fixed amount stands in (FIXED_NOISE, provisional until the
 * analysis stores daily values for those measures too).
 */
export const NOISE_RULE = 'A change is coloured only when it is bigger than usual day to day: for late and trips that ran, more than the spread between days would explain; for the others, more than 2 points (bunching), 1 minute (trip time) or half a minute (extra wait). Smaller changes stay grey.';

/**
 * PROVISIONAL: smallest change that counts, in the figure's own unit (share as 0-1, or minutes), for measures without
 * daily values, and for late and delivered when too few days are recorded to measure the spread.
 */
export const FIXED_NOISE: Record<CompareKey, number> = { late: 0.02, bunching: 0.02, delivered: 0.01, tripTime: 1, extraWait: 0.5 };

/**
 * Noise for a week-over-week change measured from daily values: 2 x the standard error of the difference of two weekly
 * means. The file holds daily values for this week only, so their spread stands in for both weeks:
 * 2 * sd * sqrt(1/n1 + 1/n2). `null` with fewer than 3 days (no spread to measure).
 * TODO (planned day-split rebuild of the analysis): store last week's daily values too, so each week uses its own
 * spread: 2 * sqrt(sd1^2/n1 + sd2^2/n2).
 */
export function dailyNoise(daily: readonly number[], nThis: number, nLast: number): number | null {
  if (daily.length < 3 || nThis < 1 || nLast < 1) return null;
  const mean = daily.reduce((a, x) => a + x, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((a, x) => a + (x - mean) ** 2, 0) / (daily.length - 1));
  return 2 * sd * Math.sqrt(1 / nThis + 1 / nLast);
}

/** This week's daily values on days with good recordings, where the file has them (late share, trips that ran). */
export function weekDailyValues(v3: LiveV3): { late: number[]; delivered: number[] } {
  const ok = new Set(v3.weekly?.thisWeek.healthyDates ?? []);
  return {
    late: v3.bands.all.adherence.timepoints.all.byDate.filter(d => ok.has(d.date) && d.n > 0).map(d => d.lateShare),
    delivered: (v3.serviceDelivered?.byDay ?? []).flatMap(d => (ok.has(d.date) && d.share != null ? [d.share] : [])),
  };
}

/**
 * The one colouring decision: 'better' or 'worse' only when the change is bigger than the noise (measured when given,
 * else FIXED_NOISE), otherwise 'same'. `measured` says which noise was used, for the hover text.
 */
export function weekChangeTone(key: CompareKey, now: number, before: number, lowerIsBetter: boolean, noise: number | null = null): { tone: 'better' | 'worse' | 'same'; big: boolean; measured: boolean } {
  const big = Math.abs(now - before) > (noise ?? FIXED_NOISE[key]);
  return { tone: !big ? 'same' : (now > before) !== lowerIsBetter ? 'better' : 'worse', big, measured: noise != null };
}

export interface CompareTile {
  key: CompareKey;
  label: string;
  /** This week's value, formatted. */
  value: string;
  /** Change from last week, formatted ("+2 pts", "−1 min"), or null when there is nothing to compare. */
  delta: string | null;
  /** better / worse only when the change is bigger than the noise (weekChangeTone); otherwise same. */
  direction: 'better' | 'worse' | 'same' | 'unknown';
  /** Last week's value, formatted, for the tooltip and screen readers. */
  before: string | null;
  /** Why the chip is or is not coloured, for the hover ("a bigger change than usual day to day"). */
  why?: string;
}

/** This week against last week as five tiles: a number, a label and a change chip coloured only beyond normal noise. */
export function compareTiles(w: NonNullable<LiveV3['weekly']>, daily: { late: readonly number[]; delivered: readonly number[] } = { late: [], delivered: [] }): CompareTile[] {
  const t = w.thisWeek, l = w.lastWeek;
  const nThis = t.healthyDates.length, nLast = l.healthyDates.length;
  const noiseFor: Partial<Record<CompareKey, number | null>> = { late: dailyNoise(daily.late, nThis, nLast), delivered: dailyNoise(daily.delivered, nThis, nLast) };
  // A change that rounds to nothing reads ±0, never −0.
  const signed = (r: number, unit: string) => `${r > 0 ? '+' : r < 0 ? '−' : '±'}${m1(Math.abs(r))} ${unit}`;
  const points = (r: number) => signed(r, Math.abs(r) === 1 ? 'pt' : 'pts');
  const minutes = (x: number) => signed(Math.round(x * 10) / 10, 'min');
  const pts = (x: number) => points(Math.round(x * 100));
  const tile = (key: CompareKey, label: string, now: number | null, before: number | null, fmt: (x: number) => string, delta: (d: number) => string, lowerIsBetter: boolean): CompareTile => {
    if (now == null) return { key, label, value: '–', delta: null, direction: 'unknown', before: null };
    if (before == null) return { key, label, value: fmt(now), delta: null, direction: 'unknown', before: null };
    const { tone, big, measured } = weekChangeTone(key, now, before, lowerIsBetter, noiseFor[key] ?? null);
    const why = big ? (measured ? 'a bigger change than usual day to day' : 'a change bigger than the usual swing') : (measured ? 'within the usual day-to-day change' : 'a small change');
    return { key, label, value: fmt(now), delta: delta(now - before), direction: tone, before: fmt(before), why };
  };
  const pct0 = (x: number) => `${Math.round(x * 100)}%`;
  return [
    tile('late', 'Late', t.late?.share ?? null, l.late?.share ?? null, pct0, pts, true),
    tile('tripTime', 'Typical trip', t.tripTime?.typicalMin ?? null, l.tripTime?.typicalMin ?? null, x => `${Math.round(x)} min`, minutes, true),
    tile('extraWait', 'Extra wait', t.extraWait?.minutes ?? null, l.extraWait?.minutes ?? null, x => `${m1(x)} min`, minutes, true),
    tile('bunching', 'Bunched or gapped', t.bunching?.share ?? null, l.bunching?.share ?? null, pct0, pts, true),
    tile('delivered', 'Trips that ran', t.delivered?.share ?? null, l.delivered?.share ?? null, x => `${m1(Math.round(x * 1000) / 10)}%`, d => points(Math.round(d * 1000) / 10), false),
  ];
}

export function compareLines(w: NonNullable<LiveV3['weekly']>): Array<{ key: CompareKey; label: string; text: string; direction: 'better' | 'worse' | 'same' | 'unknown' }> {
  const t = w.thisWeek, l = w.lastWeek;
  const pct0 = (x: number) => `${Math.round(x * 100)}%`;
  const line = (key: CompareKey, label: string, now: number | null, before: number | null, short: (x: number) => string, full: (x: number) => string, lowerIsBetter: boolean) => {
    if (now == null || before == null) return { key, label, text: `${label}: not enough healthy days to compare.`, direction: 'unknown' as const };
    if (short(now) === short(before)) return { key, label, text: `${full(now)}, unchanged from last week.`, direction: 'same' as const };
    return { key, label, text: `${full(now)}, ${now > before ? 'up' : 'down'} from ${short(before)}.`, direction: (now > before) !== lowerIsBetter ? 'better' as const : 'worse' as const };
  };
  return [
    line('late', 'Late', t.late?.share ?? null, l.late?.share ?? null, pct0, x => `${pct0(x)} late`, true),
    line('tripTime', 'Trip time', t.tripTime?.typicalMin ?? null, l.tripTime?.typicalMin ?? null, x => `${Math.round(x)} min`, x => `Typical trip ${Math.round(x)} min`, true),
    line('extraWait', 'Extra wait', t.extraWait?.minutes ?? null, l.extraWait?.minutes ?? null, x => `${m1(x)} min`, x => `Riders wait ${m1(x)} min longer than scheduled`, true),
    line('bunching', 'Bunching', t.bunching?.share ?? null, l.bunching?.share ?? null, pct0, x => `${pct0(x)} of gaps too close or too far apart`, true),
    line('delivered', 'Service delivered', t.delivered?.share ?? null, l.delivered?.share ?? null, x => `${m1(Math.round(x * 1000) / 10)}%`, x => `${m1(Math.round(x * 1000) / 10)}% of scheduled trips ran`, false),
  ];
}

/**
 * One line above a run-time chart: the hour that runs furthest over (or under) the schedule, in whole minutes.
 * Only hours with at least `minN` trips count.
 */
export function runTimeTakeaway(label: string, hours: ReadonlyArray<{ hour: number; n: number; scheduledMin: number; typicalMin: number }>, minN = 5): string {
  const ok = hours.filter(h => h.n >= minN);
  if (!ok.length) return `${label}: too few trips were measured to say.`;
  const over = ok.reduce((a, h) => (h.typicalMin - h.scheduledMin > a.typicalMin - a.scheduledMin ? h : a));
  const under = ok.reduce((a, h) => (h.typicalMin - h.scheduledMin < a.typicalMin - a.scheduledMin ? h : a));
  const o = Math.round(over.typicalMin - over.scheduledMin);
  const u = Math.round(under.scheduledMin - under.typicalMin);
  if (o >= 1) return `${label} runs about ${o} min over schedule at ${hourName(over.hour)}.`;
  if (u >= 1) return `${label} runs at or under schedule all day, about ${u} min under at ${hourName(under.hour)}.`;
  return `${label} runs close to schedule all day.`;
}
