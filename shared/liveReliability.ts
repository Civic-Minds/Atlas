/**
 * Schedule adherence and bunching for one route, from its published Live summary (CIV-1860). Built once and shared: the
 * Atlas Studio MCP tools (route_reliability, route_bunching) and Studio's view call these same functions, so both say the
 * same thing (Ryan's rule: MCP and Studio share every capability).
 *
 * Pure: the caller passes the route's summary in (the `v3` block of atlas/live/<agency>/<route>.json); nothing here
 * fetches or reads files. Figures only (shares, minutes, period keys, stop ids); sentences belong to the caller, worded
 * with shared/liveWording.ts. Thresholds come from shared/rules/live.ts. No percentiles: a figure is a share or minutes.
 */
import { weekForBand, type DashboardBand, type LiveV3, type WeekMetrics } from './liveDashboard';
import { DAYTIME_PERIOD_KEYS } from './rules/periods';
import { BUNCHED_GAP_SEC, EARLY_AT_OR_BELOW_MIN, GAPPED_FACTOR, LATE_ABOVE_MIN } from './rules/live';
import { DEFAULT_CUTOFFS, bunchedText, earlyText, gappedText, lateText, type CutoffCounts } from './liveCutoffs';

/** The time-of-day keys a reliability answer covers: the whole day, then the map's daytime periods. */
export const RELIABILITY_BANDS: readonly DashboardBand[] = ['all', ...DAYTIME_PERIOD_KEYS];

/** The definitions every figure uses, from shared/rules/live.ts. */
export const RELIABILITY_DEFINITIONS = {
  lateAboveMin: LATE_ABOVE_MIN,
  earlyAtOrBelowMin: EARLY_AT_OR_BELOW_MIN,
  bunchedGapSec: BUNCHED_GAP_SEC,
  gappedFactor: GAPPED_FACTOR,
} as const;

/** What each Live figure means, in words, from the same shared rules: the MCP's answers and Studio's view say it the same way. */
export const RELIABILITY_DEFINITION_TEXT = {
  late: lateText(DEFAULT_CUTOFFS.lateAfterMin),
  early: earlyText(DEFAULT_CUTOFFS.earlyBeforeMin),
  bunched: bunchedText(DEFAULT_CUTOFFS.bunchedWithinMin),
  gapped: gappedText(DEFAULT_CUTOFFS.gappedFactor),
} as const;

/** One week's figures for one time of day. Null where nothing was measured. */
export interface WeekFigures {
  dates: string[];
  /** Share of departures more than LATE_ABOVE_MIN late, and how many departures it counts. */
  late: { share: number; departures: number } | null;
  /** Typical end-to-end trip time against the timetable's, in minutes. */
  tripTime: { scheduledMin: number; typicalMin: number; trips: number } | null;
  /** Share of scheduled trips that were seen running. */
  delivered: { share: number; seen: number; notSeen: number } | null;
  /** Share of gaps between vehicles that were bunched (BUNCHED_GAP_SEC or less) or gapped (over GAPPED_FACTOR × the scheduled gap). */
  bunching: { badShare: number; bunchedShare: number | null; gappedShare: number | null; gaps: number } | null;
  /** Average wait added at stops served every 15 minutes or better, in minutes. */
  extraWaitMin: number | null;
  /** How late each departure was and how big each gap was, for figures at a planner's own cut-offs (CIV-1869). Absent in older files. */
  cutoffCounts?: CutoffCounts;
}

export interface LateStop { stopId: string; name: string; direction: string; lateShare: number; typicalDelayMin: number; departures: number }

export interface BandReliability {
  thisWeek: WeekFigures | null;
  lastWeek: WeekFigures | null;
  /** The stops most often late in this time of day, worst first (the Live page's ranked stops). */
  lateStops: LateStop[];
}

export interface RouteReliability {
  /** The service dates the figures count (days with good recordings). */
  dates: string[];
  directions: Record<string, string>;
  /** False when either week has too few good days to compare (the Live page's own test). */
  weeksComparable: boolean;
  bands: Partial<Record<DashboardBand, BandReliability>>;
  definitions: typeof RELIABILITY_DEFINITIONS;
}

export interface BunchingStretch { fromStopId: string; fromName: string; toStopId: string; toName: string; risePoints: number }
export interface BunchingStop { stopId: string; name: string; badShare: number; bunchedShare: number; gappedShare: number; typicalGapMin: number | null; departures: number }

export interface DirectionBunching {
  directionId: number;
  direction: string;
  /** Share of gaps that were bunched or gapped where the route starts. */
  startShare: number | null;
  /** How it changes along the route: 'forms' (it starts at one stretch), 'gradual', or 'none'. */
  pattern: 'forms' | 'gradual' | 'none' | null;
  /** The stretch where bunching forms, or where it rises most. */
  formsAt: BunchingStretch | null;
  worstStops: BunchingStop[];
}

export interface RouteBunching {
  dates: string[];
  bands: Partial<Record<DashboardBand, { thisWeek: WeekFigures['bunching']; lastWeek: WeekFigures['bunching']; byDirection: DirectionBunching[]; /** As WeekFigures.cutoffCounts (CIV-1869). */ cutoffCounts?: { thisWeek: CutoffCounts | null; lastWeek: CutoffCounts | null } }>>;
  definitions: typeof RELIABILITY_DEFINITIONS;
}

const round = (x: number, places = 3) => Math.round(x * 10 ** places) / 10 ** places;

function weekFigures(w: WeekMetrics | null | undefined): WeekFigures | null {
  if (!w) return null;
  const b = w.bunching;
  return {
    dates: w.healthyDates ?? w.dates,
    late: w.late ? { share: round(w.late.share), departures: w.late.n } : null,
    tripTime: w.tripTime ? { scheduledMin: round(w.tripTime.scheduledMin, 1), typicalMin: round(w.tripTime.typicalMin, 1), trips: w.tripTime.n } : null,
    delivered: w.delivered ? { share: round(w.delivered.share), seen: w.delivered.seen, notSeen: w.delivered.notSeen } : null,
    // bunched and gapped are already shares of the gaps (shared/liveAgency.ts reads them the same way).
    bunching: b ? { badShare: round(b.share), bunchedShare: b.bunched != null ? round(b.bunched) : null, gappedShare: b.gapped != null ? round(b.gapped) : null, gaps: b.gaps } : null,
    extraWaitMin: w.extraWait ? round(w.extraWait.minutes, 1) : null,
    ...(w.cutoffCounts ? { cutoffCounts: w.cutoffCounts } : {}),
  };
}

const goodDates = (v3: LiveV3) => v3.window.goodDates ?? v3.window.dates;

/** Schedule against actual for one route, by time of day: late share, trip time, service delivered, this week and last, and the stops most often late. */
export function routeReliability(v3: LiveV3, opts: { lateStops?: number } = {}): RouteReliability {
  const n = opts.lateStops ?? 3;
  const bands: RouteReliability['bands'] = {};
  for (const band of RELIABILITY_BANDS) {
    const week = weekForBand(v3.weekly, band);
    const stops = (v3.bands?.[band]?.stops ?? []).filter(s => s.ranked).sort((a, b) => b.lateShare - a.lateShare).slice(0, n);
    if (!week && !stops.length) continue;
    bands[band] = {
      thisWeek: weekFigures(week?.thisWeek),
      lastWeek: weekFigures(week?.lastWeek),
      lateStops: stops.map(s => ({ stopId: s.stopId, name: s.name, direction: v3.directionLabels[String(s.directionId)] ?? String(s.directionId), lateShare: round(s.lateShare), typicalDelayMin: round(s.medianMin, 1), departures: s.n })),
    };
  }
  return { dates: goodDates(v3), directions: v3.directionLabels, weeksComparable: v3.weekly?.comparable ?? false, bands, definitions: RELIABILITY_DEFINITIONS };
}

/** Bunching for one route, by time of day and direction: how much, where it forms, and the stops where gaps go most wrong. */
export function routeBunching(v3: LiveV3, opts: { worstStops?: number } = {}): RouteBunching {
  const n = opts.worstStops ?? 3;
  const bands: RouteBunching['bands'] = {};
  for (const band of RELIABILITY_BANDS) {
    const week = weekForBand(v3.weekly, band);
    const byDirection: DirectionBunching[] = [];
    for (const d of v3.bunching ?? []) {
      const b = d.bands?.[band];
      if (!b) continue;
      const at = b.forms ?? b.biggestRise;
      byDirection.push({
        directionId: d.directionId,
        direction: v3.directionLabels[String(d.directionId)] ?? String(d.directionId),
        startShare: b.baselineBadShare != null ? round(b.baselineBadShare) : null,
        pattern: b.kind,
        formsAt: at ? { fromStopId: at.fromStopId, fromName: at.fromName, toStopId: at.toStopId, toName: at.toName, risePoints: round(at.rise * 100, 1) } : null,
        worstStops: [...b.stops].sort((x, y) => y.badShare - x.badShare).slice(0, n).map(s => ({
          stopId: s.stopId, name: s.name, badShare: round(s.badShare), bunchedShare: round(s.bunchedShare), gappedShare: round(s.gappedShare),
          typicalGapMin: s.medianGapSec != null ? round(s.medianGapSec / 60, 1) : null, departures: s.n,
        })),
      });
    }
    if (!week && !byDirection.length) continue;
    const [tw, lw] = [weekFigures(week?.thisWeek), weekFigures(week?.lastWeek)];
    bands[band] = {
      thisWeek: tw?.bunching ?? null, lastWeek: lw?.bunching ?? null, byDirection,
      ...(tw?.cutoffCounts || lw?.cutoffCounts ? { cutoffCounts: { thisWeek: tw?.cutoffCounts ?? null, lastWeek: lw?.cutoffCounts ?? null } } : {}),
    };
  }
  return { dates: goodDates(v3), bands, definitions: RELIABILITY_DEFINITIONS };
}

/** The small per-route file the hosted MCP reads (a few KB instead of the route's full summary), written by live-publish. */
export interface LiveReliabilityFile {
  schema: 1;
  agency: string;
  route: string;
  routeTitle: string;
  generatedAt: string;
  reliability: RouteReliability;
  bunching: RouteBunching;
}

export function liveReliabilityFile(agency: string, route: string, routeTitle: string, generatedAt: string, v3: LiveV3): LiveReliabilityFile {
  return { schema: 1, agency, route, routeTitle, generatedAt, reliability: routeReliability(v3), bunching: routeBunching(v3) };
}
