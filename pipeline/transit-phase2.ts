import {
    GtfsData,
    AnalysisResult,
    RawRouteDepartures,
    AnalysisCriteria,
    DayType,
    DayName,
    WEEKDAYS,
    ALL_DAYS,
    DAY_TO_TYPE,
} from '../types/gtfs';
import { computeMedian } from './transit-utils';
import { DEFAULT_CRITERIA, getTiersForCriteria } from './defaults';
import { SURFACE_TIER_MAXES, TIME_PERIODS } from '../shared/config.js';
import { isRailLikeRoute } from '../shared/modes.js';
import { computeRawDepartures } from './transit-phase1';
import { forCrossMidnightWindow } from './headway-utils';

export type TierDeterminerContext = {
    rawDepartureTimes: readonly number[];
    analysisTimes: readonly number[];
    day: DayName;
    routeType: string;
    railLike: boolean;
};

export type TierDeterminer = (
    headways: number[],
    tripCount: number,
    spanMinutes: number,
    tiers: number[],
    graceMinutes: number,
    maxGraceViolations: number,
    gracePercent: number,
    violationPercent: number,
    context: TierDeterminerContext,
    violationPercentByTier?: Record<number, number>,
    preCountedGraceViolations?: number,
) => string;

/**
 * The maximum total gap allowed for each true service-edge exception.
 *
 * This is deliberately applied only to the first or last departure in the
 * raw service list. A gap created by the analysis window is not an edge of
 * the service and cannot use this allowance.
 */
export const EDGE_GAP_ALLOWANCE_MINUTES = 10;
export type EdgeGapAllowanceSide = 'opening' | 'closing' | 'both';

type EdgeGapAllowanceResult = {
    tier: string;
    edgeGapAllowance?: EdgeGapAllowanceSide;
};

/**
 * Determines the frequency tier for a route based on headway analysis.
 * Returns the tightest tier the route sustains across the full span.
 */
export const determineTier = (
    headways: number[],
    tripCount: number,
    spanMinutes: number,
    tiers: number[] = SURFACE_TIER_MAXES,
    graceMinutes: number = 5,
    maxGraceViolations: number = 0,
    gracePercent: number = 0.15,
    violationPercent: number = 0.05,
    violationPercentByTier?: Record<number, number>,
    preCountedGraceViolations: number = 0,
): string => {
    for (const T of tiers) {
        const grace = Math.max(graceMinutes, Math.round(T * gracePercent));
        const tierViolationPercent = violationPercentByTier?.[T] ?? violationPercent;
        const percentageAllowance = Math.floor((headways.length + preCountedGraceViolations) * tierViolationPercent);
        const allowedViolations = Math.min(3, Math.max(maxGraceViolations, percentageAllowance));
        const minTrips = Math.ceil(spanMinutes / T);
        if (tripCount < minTrips) continue;

        let graceCount = preCountedGraceViolations;
        let fail = false;
        for (const h of headways) {
            if (h <= T) continue;
            if (h <= T + grace) {
                graceCount++;
                if (graceCount > allowedViolations) { fail = true; break; }
            } else {
                fail = true; break;
            }
        }
        if (!fail) return String(T);
    }
    return 'span';
};

/**
 * Determine a tier while allowing each true opening or closing gap to exceed
 * the target tier by up to ten minutes total. This is an absolute ceiling,
 * not ten minutes added to the ordinary grace allowance.
 *
 * The existing grace rules remain unchanged for every other gap. Each
 * qualifying edge also consumes one slot in the same bounded near-miss
 * allowance, so the edge booster cannot silently stack on top of the internal
 * exception budget. When both edges qualify, they are removed independently
 * from the tested sequence and consume two slots.
 * Removing edge departures keeps the normal trip-count and sustained-cadence
 * checks honest: at least four departures must remain when an edge exception
 * is used. Ordinary classifications retain the separate three-departure
 * minimum below.
 */
const determineTierWithEdgeGapAllowanceDetail = (
    headways,
    tripCount,
    spanMinutes,
    tiers,
    graceMinutes,
    maxGraceViolations,
    gracePercent,
    violationPercent,
    context,
    violationPercentByTier,
): EdgeGapAllowanceResult => {
    const analysisTimes = [...context.analysisTimes];
    const rawTimes = context.rawDepartureTimes;
    const actualOpening = !rawTimes.some(time => time < analysisTimes[0]);
    const actualClosing = !rawTimes.some(time => time > analysisTimes[analysisTimes.length - 1]);

    for (const tier of tiers) {
        const gaps = analysisTimes.slice(1).map((time, index) => time - analysisTimes[index]);
        const existingGrace = Math.max(graceMinutes, Math.round(tier * gracePercent));
        const openingEligible = actualOpening
            && gaps[0] > tier + existingGrace
            && gaps[0] <= tier + EDGE_GAP_ALLOWANCE_MINUTES;
        const closingEligible = actualClosing
            && gaps[gaps.length - 1] > tier + existingGrace
            && gaps[gaps.length - 1] <= tier + EDGE_GAP_ALLOWANCE_MINUTES;

        const variants: Array<{ opening: boolean; closing: boolean }> = [];
        if (openingEligible && closingEligible) {
            variants.push({ opening: true, closing: true });
        } else {
            if (openingEligible) variants.push({ opening: true, closing: false });
            if (closingEligible) variants.push({ opening: false, closing: true });
        }

        for (const variant of variants) {
            const trimmed = analysisTimes.slice(variant.opening ? 1 : 0, variant.closing ? -1 : undefined);
            if (trimmed.length < 4) continue;
            const trimmedGaps = trimmed.slice(1).map((time, index) => time - trimmed[index]);
            if (determineTier(
                trimmedGaps,
                trimmed.length,
                trimmed[trimmed.length - 1] - trimmed[0],
                [tier],
                graceMinutes,
                maxGraceViolations,
                gracePercent,
                violationPercent,
                violationPercentByTier,
                Number(variant.opening) + Number(variant.closing),
            ) === String(tier)) {
                return {
                    tier: String(tier),
                    edgeGapAllowance: variant.opening && variant.closing
                        ? 'both'
                        : variant.opening ? 'opening' : 'closing',
                };
            }
        }

        // Preserve the baseline calculation exactly when neither edge is
        // eligible for this tier.
        if (!openingEligible && !closingEligible && determineTier(
            gaps,
            analysisTimes.length,
            analysisTimes[analysisTimes.length - 1] - analysisTimes[0],
            [tier],
            graceMinutes,
            maxGraceViolations,
            gracePercent,
            violationPercent,
            violationPercentByTier,
        ) === String(tier)) {
            return { tier: String(tier) };
        }
    }

    // Keep the unused baseline arguments explicit: this determiner has the
    // same signature as production and replaces only tier selection.
    void headways;
    void tripCount;
    void spanMinutes;
    return { tier: 'span' };
};

export const determineTierWithEdgeGapAllowance: TierDeterminer = (...args) =>
    determineTierWithEdgeGapAllowanceDetail(...args).tier;

/**
 * Compute headway statistics and reliability score from a departure time array.
 */
export function computeHeadwayStats(times: number[]) {
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const median = computeMedian(gaps);

    // Peak detection: 2-hour sliding window, O(n) two-pointer
    let peakHeadway = avg;
    let peakWindow = { start: times[0] ?? 0, end: (times[0] ?? 0) + 120 };
    let maxDensity = 0;
    let right = 0;

    for (let left = 0; left < times.length; left++) {
        const windowEnd = times[left] + 120;
        while (right < times.length && times[right] <= windowEnd) right++;
        const count = right - left;
        if (count > maxDensity) {
            maxDensity = count;
            peakWindow = { start: times[left], end: windowEnd };
            const peakGaps = [];
            for (let j = left + 1; j < right; j++) peakGaps.push(times[j] - times[j - 1]);
            peakHeadway = peakGaps.length ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length : avg;
        }
    }

    const variance = gaps.length > 1
        ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const bunchedGaps = gaps.filter(g => g < avg * 0.25).length;
    const bunching = bunchedGaps / (gaps.length || 1);
    const bunchingPenalty = bunching * 60;
    const significantGaps = gaps.filter(g => g > avg * 1.5).length;
    const outlierPenalty = gaps.length ? (significantGaps / gaps.length) * 40 : 0;
    const consistencyScore = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 50) : 0;
    const reliability = Math.max(0, consistencyScore - outlierPenalty - bunchingPenalty);
    const base = Math.max(...gaps, avg);

    return {
        avg,
        median,
        peakHeadway: Math.round(peakHeadway * 10) / 10,
        baseHeadway: Math.round(base * 10) / 10,
        peakWindow,
        variance: Math.round(variance * 10) / 10,
        bunchingFactor: Math.round(bunching * 100) / 100,
        reliabilityScore: Math.round(reliability),
        consistencyScore: Math.round(consistencyScore),
        bunchingPenalty: Math.round(bunchingPenalty),
        outlierPenalty: Math.round(outlierPenalty),
        gaps,
    };
}

/**
 * Estimating resources required for a route snapshot.
 */
export function computeResourceStats(
    avgHeadway: number,
    serviceSpan: { start: number; end: number },
    tripCount: number,
    criteria: AnalysisCriteria
) {
    if (avgHeadway <= 0) return { pvr: 0, opCostAnnual: 0, totalServiceHours: 0 };

    // PVR = ceil(Round Trip Time / Headway)
    // We don't have RTT directly in the analyzed result, but we can estimate it.
    // In a future phase, we should use actual trip durations.
    // For now, let's assume a heuristic: RTT is roughly 2x the average trip duration.
    // And average trip duration is roughly Span / TripCount.
    const spanMins = serviceSpan.end - serviceSpan.start;
    const estimatedTripDuration = spanMins / Math.max(1, tripCount);
    const estimatedRTT = estimatedTripDuration * 2;
    
    const pvr = Math.ceil(estimatedRTT / avgHeadway);
    
    // Annual Operating Cost
    // Total Hours per day = span * (60 / headway) / 60? No, simpler: tripCount * duration.
    const dailyServiceHours = (tripCount * estimatedTripDuration) / 60;
    const hourlyRate = criteria.hourlyRate || 150;
    const daysPerYear = 255; // Heuristic for weekdays
    
    const opCostAnnual = dailyServiceHours * hourlyRate * daysPerYear;

    return {
        pvr,
        opCostAnnual: Math.round(opCostAnnual),
        totalServiceHours: Math.round(dailyServiceHours * 10) / 10
    };
}

/**
 * Choose one real day to represent a day-type rollup. Combining departures from
 * different weekdays creates a timetable that never actually ran and can make
 * the displayed headway look faster than any individual day.
 */
const representativeRollupEntry = <T extends { result: AnalysisResult }>(
    entries: T[],
): T => entries[representativeIndexByCount(entries.map(entry => entry.result.times.length))];

/**
 * Mon-Fri index of the representative weekday, or null when the median weekday has no
 * service. Shared with the stop-level Weekday grouping in process-core so stop and route
 * metrics describe the same weekday (#710).
 */
export function representativeWeekdayIndex(countsByWeekday: number[]): number | null {
    // Mon-Fri departure counts, 0 for a day without service. The median weekday decides:
    // a route that runs on fewer than 3 of 5 weekdays has no representative weekday (#710).
    const sorted = [...countsByWeekday].sort((a, b) => a - b);
    if (!(sorted[Math.floor((sorted.length - 1) / 2)] > 0)) return null;
    return representativeIndexByCount(countsByWeekday);
}

/**
 * Index of the day whose departure count is closest to the median count; the
 * earliest such day wins a tie.
 */
export function representativeIndexByCount(counts: number[]): number {
    const sorted = [...counts].sort((a, b) => a - b);
    // Lower middle for an even count: the worse of the two middle days decides.
    const medianCount = sorted[Math.floor((sorted.length - 1) / 2)];
    return counts.reduce((bestIndex, count, index) =>
        Math.abs(count - medianCount) < Math.abs(counts[bestIndex] - medianCount) ? index : bestIndex, 0);
}

/** A day counts as the previous night's tail only if all of its departures are before 06:00
 * (the same early-morning cutoff #297 uses for overnight-only service ids)... */
export const PREVIOUS_NIGHT_TAIL_LAST_DEPARTURE_BEFORE_MIN = 6 * 60;
/** ...and its first departure follows the previous day's last one within 90 minutes. */
export const PREVIOUS_NIGHT_TAIL_MAX_GAP_MIN = 90;

/**
 * Route/direction/days (`route::dir::DayName`) whose only service is the after-midnight tail of
 * the previous night (#718). GTFS can write a night's after-midnight trips as 24:00+ times on
 * that night's own service, or as 00:00+ times on a separate service active the next calendar
 * day. In the second form the next day shows trips it does not really have: clemson-cat TL-24
 * runs Saturday 17:00-23:59 and Sunday 00:00-02:30 only, and Sunday got tier 30 from the tail.
 * Owl routes and real early starts are not tails: the previous day's last departure is hours
 * earlier (an owl route ends near 05:00; a 04:30 start is ~5 h after a 23:30 finish).
 * All groups of a route and direction are pooled, so a day with any later service never counts.
 */
export function previousNightTailDays(rawData: readonly RawRouteDepartures[]): Set<string> {
    const span = new Map<string, { route: string; dir: string; day: DayName; first: number; last: number }>();
    for (const raw of rawData) {
        if (raw.departureTimes.length === 0) continue;
        const key = `${raw.route}::${raw.dir}::${raw.day}`;
        let first = Infinity;
        let last = -Infinity;
        for (const time of raw.departureTimes) {
            if (time < first) first = time;
            if (time > last) last = time;
        }
        const existing = span.get(key);
        span.set(key, existing
            ? { ...existing, first: Math.min(existing.first, first), last: Math.max(existing.last, last) }
            : { route: raw.route, dir: raw.dir, day: raw.day, first, last });
    }
    const tails = new Set<string>();
    for (const [key, { route, dir, day, first, last }] of span) {
        if (last >= PREVIOUS_NIGHT_TAIL_LAST_DEPARTURE_BEFORE_MIN) continue;
        const dayIndex = ALL_DAYS.indexOf(day);
        const previousDay = ALL_DAYS[(dayIndex + ALL_DAYS.length - 1) % ALL_DAYS.length];
        const previous = span.get(`${route}::${dir}::${previousDay}`);
        if (!previous) continue;
        // A negative gap means the previous day already runs past this day's first departure in
        // 24:00+ times; these trips are then not its continuation.
        const gap = first + 1440 - previous.last;
        if (gap >= 0 && gap <= PREVIOUS_NIGHT_TAIL_MAX_GAP_MIN) tails.add(key);
    }
    return tails;
}

/**
 * Phase 2: Apply analysis criteria to raw departure data.
 *
 * Filters departures to each day type's time window, classifies into tiers,
 * then rolls up individual days into Weekday/Saturday/Sunday summaries.
 * Weekday rollup uses the WORST tier across Mon–Fri.
 */
export function applyAnalysisCriteria(
    rawData: RawRouteDepartures[],
    criteria: AnalysisCriteria = DEFAULT_CRITERIA,
    tierDeterminer: TierDeterminer = determineTierWithEdgeGapAllowance,
    /**
     * Weekdays with service per route_id::dir across all of its patterns (#710). When omitted,
     * counted from rawData: the distinct weekdays any of the route direction's patterns appear on.
     */
    weekdayServiceDays?: ReadonlyMap<string, number>,
): AnalysisResult[] {
    const rawWeekdays = new Map<string, Set<DayName>>();
    for (const raw of rawData) {
        if (!(WEEKDAYS as readonly DayName[]).includes(raw.day)) continue;
        const key = `${raw.route}::${raw.dir}`;
        rawWeekdays.set(key, (rawWeekdays.get(key) ?? new Set<DayName>()).add(raw.day));
    }
    const routeDirWeekdays = (route: string, dir: string): number =>
        weekdayServiceDays?.get(`${route}::${dir}`) ?? rawWeekdays.get(`${route}::${dir}`)?.size ?? 0;
    const perDayResults = new Map<string, { dayType: DayType; day: DayName; result: AnalysisResult; rawTimes: number[] }>();
    const tailDays = previousNightTailDays(rawData);

    for (const raw of rawData) {
        const dayType = DAY_TO_TYPE[raw.day];
        const dayConfig = criteria.dayTypes[dayType];
        if (!dayConfig) continue;

        const { start, end } = dayConfig.timeWindow;
        let windowedTimes = raw.departureTimes.filter(t => t >= start && t <= end);
        let isOvernightFallback = false;
        if (windowedTimes.length < 2) {
            // Entirely outside the daytime analysis window -- e.g. TTC Blue Night, whose service
            // runs ~1:30-5:30am with zero departures in the 07:00-22:00 window (#313). Without
            // this, such a route is silently dropped from the output entirely, not just missing
            // a flag. Fall back to the full raw departure list so genuinely overnight-only
            // service still gets a real tier/headway instead of vanishing. Only fires when the
            // daytime window produced <2 trips, so this can never affect a route that already
            // works today -- purely additive.
            const allTimes = [...raw.departureTimes].sort((a, b) => a - b);
            if (allTimes.length < 2) continue; // truly can't compute a headway from <2 total departures
            windowedTimes = allTimes;
            isOvernightFallback = true;
        }

        // For all rail routes, use the midday window (09:30–14:30) for tier classification
        // and display stats. Outbound (dir=0): peak short-turn trains cluster every 8–10 min
        // at Union, inflating trip count and creating long afternoon gaps that break tier checks.
        // Inbound (dir=1): trains from multiple origin stations are merged into one "to Union"
        // pool; full-window rush-hour density gives a spuriously low headway (e.g. every 18 min
        // on KI when actual sustained service is much less frequent). Midday window reflects the
        // honest off-peak combined frequency for both directions.
        // Falls back to full window when midday has <2 trips (e.g. GO Milton, Kitchener GO).
        const MIDDAY_START = 570; // 09:30
        const MIDDAY_END = 870;   // 14:30
        const isRail = raw.railLike ?? isRailLikeRoute({ routeType: raw.routeType });
        let analysisWindow = windowedTimes;
        let analysisWindowMins = end - start;
        if (isRail) {
            const midday = windowedTimes.filter(t => t >= MIDDAY_START && t <= MIDDAY_END);
            if (midday.length >= 2) {
                analysisWindow = midday;
                analysisWindowMins = MIDDAY_END - MIDDAY_START;
            }
        }

        const analysisGaps: number[] = [];
        for (let i = 1; i < analysisWindow.length; i++) {
            analysisGaps.push(analysisWindow[i] - analysisWindow[i - 1]);
        }

        const spanMins = analysisWindow[analysisWindow.length - 1] - analysisWindow[0];
        const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, criteria.modeTierOverrides);
        // Routes that don't provide sustained all-day service — classify as span:
        // - trips compressed into ≤90 minutes (school runs, shuttle bursts)
        // - active span covers <40% of the analysis window (rush-hour-only, e.g. GO Milton)
        // The coverage term has no meaning for the overnight fallback -- there's no fixed
        // "window" a genuinely overnight-only route's span should be compared against (a tight
        // 2-5am owl route would otherwise get misclassified as span the same way it was
        // missing entirely before this fix). Rely on the ≤90min burst check alone there.
        const coverage = analysisWindowMins > 0 ? spanMins / analysisWindowMins : 0;
        const periodTripCounts = Object.fromEntries(
            TIME_PERIODS.map(({ key, startHour, endHour }) => [
                key,
                windowedTimes.filter(time => time >= startHour * 60 && time < endHour * 60).length,
            ]),
        ) as Record<string, number>;
        // Two separate rush-hour blocks can span most of the clock even though the route has no
        // useful midday service (e.g. TTC 986). The first-to-last-departure coverage check misses
        // that interior gap, so treat repeated peak service without repeated midday/evening service
        // as genuinely irregular. A single stray trip outside the peaks does not make the route
        // regular; evening-only routes with repeated departures remain time-limited.
        const hasRepeatedPeakService = periodTripCounts.amPeak >= 3 || periodTripCounts.pmPeak >= 3;
        const hasRepeatedOffPeakService = periodTripCounts.midday >= 3 || periodTripCounts.evening >= 3;
        const isSplitPeakService = !isOvernightFallback && hasRepeatedPeakService && !hasRepeatedOffPeakService;
        const isLimitedService = isSplitPeakService || spanMins <= 90 || (!isOvernightFallback && coverage < 0.4);
        const tierDetail = tierDeterminer === determineTierWithEdgeGapAllowance
            ? determineTierWithEdgeGapAllowanceDetail(
                analysisGaps,
                analysisWindow.length,
                spanMins,
                tiers,
                criteria.graceMinutes,
                criteria.maxGraceViolations,
                criteria.gracePercent,
                criteria.violationPercent,
                {
                    rawDepartureTimes: raw.departureTimes,
                    analysisTimes: analysisWindow,
                    day: raw.day,
                    routeType: raw.routeType,
                    railLike: isRail,
                },
                criteria.violationPercentByTier,
            )
            : null;
        const determinedTier = tierDetail?.tier ?? tierDeterminer(
            analysisGaps,
            analysisWindow.length,
            spanMins,
            tiers,
            criteria.graceMinutes,
            criteria.maxGraceViolations,
            criteria.gracePercent,
            criteria.violationPercent,
            {
                rawDepartureTimes: raw.departureTimes,
                analysisTimes: analysisWindow,
                day: raw.day,
                routeType: raw.routeType,
                railLike: isRail,
            },
            criteria.violationPercentByTier,
        );
        const edgeGapAllowance = tierDetail?.edgeGapAllowance;
        // `span` used to combine two different ideas: a genuinely irregular burst (school
        // service, one or two trips) and a route with a stable schedule that only operates during
        // one period (NRT's evening routes). Require enough repeated service to distinguish them.
        // The 07:00–22:00 coverage check remains a coverage signal, not proof of irregularity.
        // Three repeated departures are the minimum evidence for a schedule; one or two trips
        // remain irregular even when their single gap happens to match a published tier.
        const hasSustainedCadence = analysisWindow.length >= 3 && determinedTier !== 'span';
        const serviceClass = isSplitPeakService
            ? 'irregular'
            : isLimitedService
            ? (hasSustainedCadence ? 'time-limited' : 'irregular')
            : 'regular';
        // A regular route that is slower than the published finite tiers is infrequent. Only
        // genuinely irregular service keeps the span sentinel used by the UI and map filters.
        const tier = serviceClass === 'irregular'
            ? 'span'
            : determinedTier === 'span' ? 'infrequent' : determinedTier;

        const stats = computeHeadwayStats(analysisWindow);
        
        const resourceStats = computeResourceStats(
            stats.avg, 
            { start: windowedTimes[0], end: windowedTimes[windowedTimes.length - 1] }, 
            windowedTimes.length, 
            criteria
        );

        const result: AnalysisResult = {
            route: raw.route,
            day: dayType,
            dir: raw.dir,
            avgHeadway: Math.round(stats.avg),
            medianHeadway: Math.round(stats.median),
            tier,
            edgeGapAllowance,
            serviceClass,
            tripCount: windowedTimes.length,
            gaps: stats.gaps,
            times: windowedTimes,
            peakHeadway: stats.peakHeadway ? Math.round(stats.peakHeadway) : undefined,
            baseHeadway: stats.baseHeadway ? Math.round(stats.baseHeadway) : undefined,
            peakWindow: stats.peakWindow,
            reliabilityScore: stats.reliabilityScore,
            consistencyScore: stats.consistencyScore,
            bunchingPenalty: stats.bunchingPenalty,
            outlierPenalty: stats.outlierPenalty,
            headwayVariance: stats.variance,
            bunchingFactor: stats.bunchingFactor,
            serviceSpan: { start: windowedTimes[0], end: windowedTimes[windowedTimes.length - 1] },
            routeType: raw.routeType,
            modeName: raw.modeName,
            railLike: isRail,
            serviceIds: raw.serviceIds,
            warnings: isOvernightFallback
                ? [...(raw.warnings ?? []), 'Overnight-only service (outside daytime analysis window)']
                : raw.warnings,
            daysIncluded: [raw.day],
            previousNightTail: tailDays.has(`${raw.route}::${raw.dir}::${raw.day}`) || undefined,
            headsign: raw.headsign,
            routeVariant: raw.routeVariant,
            shapeId: raw.shapeId,
            routeVariant: raw.routeVariant,
            ...resourceStats
        };
        perDayResults.set(`${raw.route}::${raw.dir}::${raw.headsign ?? ''}::${raw.shapeId ?? ''}::${raw.routeVariant ?? ''}::${raw.day}`, { dayType, day: raw.day, result, rawTimes: raw.departureTimes });
    }

    // Roll up per-day results into day-type summaries
    const rollupGroups = new Map<string, { dayType: DayType; entries: { day: DayName; result: AnalysisResult; rawTimes: number[] }[] }>();
    for (const [, entry] of perDayResults) {
        const key = `${entry.result.route}::${entry.result.dir}::${entry.result.headsign ?? ''}::${entry.result.shapeId ?? ''}::${entry.result.routeVariant ?? ''}::${entry.dayType}`;
        if (!rollupGroups.has(key)) rollupGroups.set(key, { dayType: entry.dayType, entries: [] });
        rollupGroups.get(key)!.entries.push({ day: entry.day, result: entry.result, rawTimes: entry.rawTimes });
    }

    const results: AnalysisResult[] = [];

    for (const [, group] of rollupGroups) {
        const { dayType, entries } = group;
        if (entries.length === 0) continue;

        // A day whose only service is the previous night's after-midnight tail (#718) does not
        // set the tier or service class while another day in the group has its own service.
        const ownServiceEntries = entries.filter(e => !e.result.previousNightTail);
        const tierEntries = ownServiceEntries.length > 0 ? ownServiceEntries : entries;
        const INFREQUENT_VAL = 1e6; // sentinel: worse than any real tier, better than span (Infinity)
        const tierValues = tierEntries.map(e =>
            e.result.tier === 'span' ? Infinity
            : e.result.tier === 'infrequent' ? INFREQUENT_VAL
            : parseInt(e.result.tier)
        );
        const worstTierValue = Math.max(...tierValues);
        const worstTier = worstTierValue === Infinity ? 'span'
            : worstTierValue >= INFREQUENT_VAL ? 'infrequent'
            : String(worstTierValue);
        const weekdayTierVariation = dayType === 'Weekday'
            && new Set(tierEntries.map(entry => entry.result.tier)).size > 1;
        const ownServiceClass = tierEntries.some(e => e.result.serviceClass === 'irregular')
            ? 'irregular'
            : tierEntries.some(e => e.result.serviceClass === 'time-limited')
            ? 'time-limited'
            : 'regular';

        // Weekday: the representative weekday is chosen over all five weekdays, so a route
        // that runs on only some of them (clemson-cat TL-24, Thu+Fri nights) has no service on
        // it. Such a route is shown as infrequent ("limited") with no headway or timetable,
        // not as a frequency tier taken from the days it does run (#710).
        const weekdayIndex = dayType === 'Weekday'
            // A weekday whose only service is the previous night's tail counts as unserved (#718).
            ? representativeWeekdayIndex(WEEKDAYS.map(day => {
                const entry = entries.find(e => e.day === day);
                return entry && !entry.result.previousNightTail ? entry.result.times.length : 0;
            }))
            : undefined;
        // Whether a route runs on only some weekdays is decided per route direction, across all
        // of its shapes and patterns, never per pattern: LANTA and Lancaster give each weekday's
        // service its own shape, so every single pattern runs on one weekday although the route
        // runs on all five. A pattern of a full-week route keeps the typical served-day rollup.
        const partialWeekday = dayType === 'Weekday'
            && routeDirWeekdays(entries[0].result.route, entries[0].result.dir) < 3;
        const repEntry = weekdayIndex != null && !partialWeekday
            ? entries.find(e => e.day === WEEKDAYS[weekdayIndex])!
            : representativeRollupEntry(entries);
        const rep = repEntry.result;
        // The representative day's only service is the previous night's tail (clemson-cat TL-24
        // Sunday: 00:00-02:30 only, continuing Saturday 17:00-23:59). Same presentation as a
        // partial weekday: limited, with no headway or timetable, instead of a frequency tier
        // taken from another night's trips (#718).
        const previousNightTailOnly = !partialWeekday && rep.previousNightTail === true;
        const noTimetable = partialWeekday || previousNightTailOnly;
        const serviceClass = previousNightTailOnly ? 'time-limited' : ownServiceClass;
        // Rail rollup: apply the existing midday representative-day logic on top of
        // the day-type representative selection used by all modes.
        // For dir=0 (outbound): avoids Friday extra-train distortion.
        // For dir=1 (inbound): all trains share "Union Station" headsign so the pool is the
        // same across weekdays; representative-day pick is still valid.
        const isRailRollup = rep.railLike ?? isRailLikeRoute({ routeType: rep.routeType });
        const rollupStatsBase = (() => {
          if (isRailRollup) {
            // Pick the representative day's midday times. A weekday union creates spurious
            // short gaps when some days (e.g. Fridays) run extra trains.
            const MIDDAY_START = 570; // 09:30
            const MIDDAY_END = 870;   // 14:30
            const dayMiddays = entries.map(e => e.result.times.filter(t => t >= MIDDAY_START && t <= MIDDAY_END));
            const counts = dayMiddays.map(d => d.length);
            const sortedCounts = [...counts].sort((a, b) => a - b);
            const medianCount = sortedCounts[Math.floor(sortedCounts.length / 2)];
            const bestIdx = counts.reduce((bestI, c, i) =>
              Math.abs(c - medianCount) < Math.abs(counts[bestI] - medianCount) ? i : bestI, 0);
            const repTimes = dayMiddays[bestIdx];
            if (repTimes.length >= 2) return repTimes;
          }
          return rep.times;
        })();
        const stats = computeHeadwayStats(rollupStatsBase);
        // Keep the complete representative-day schedule in the result. Rail uses a
        // midday sample for tier stability, but downstream period/hour metrics and
        // sparklines need the morning, evening, and overnight departures too.
        const rollupTimes = noTimetable ? [] : isRailRollup ? rep.times : rollupStatsBase;
        const avgTrips = Math.round(entries.reduce((sum, e) => sum + e.result.tripCount, 0) / entries.length);
        const allStarts = entries.map(e => e.result.serviceSpan?.start ?? 0);
        const allEnds = entries.map(e => e.result.serviceSpan?.end ?? 0);
        const allServiceIds = [...new Set(entries.flatMap(e => e.result.serviceIds || []))];
        const allWarnings = [...new Set(entries.flatMap(e => e.result.warnings || []))];
        const daysIncluded = entries.map(e => e.day);

        if (dayType === 'Weekday' && daysIncluded.length < 5) {
            const missing = WEEKDAYS.filter(d => !daysIncluded.includes(d));
            allWarnings.push(`Only runs ${daysIncluded.length}/5 weekdays (missing: ${missing.join(', ')})`);
        }

        const span = { start: Math.min(...allStarts), end: Math.max(...allEnds) };
        const resourceStats = computeResourceStats(stats.avg, span, avgTrips, criteria);

        results.push({
            route: rep.route,
            day: dayType,
            dir: rep.dir,
            avgHeadway: stats.avg,
            medianHeadway: stats.median,
            peakHeadway: stats.peakHeadway,
            baseHeadway: Math.round(stats.baseHeadway * 10) / 10,
            peakWindow: stats.peakWindow,
            serviceSpan: span,
            tier: noTimetable ? 'infrequent' : worstTier,
            partialWeekday: partialWeekday || undefined,
            // Periods it runs in on the weekdays it does serve, so "any frequency" in that
            // period still draws it as limited while a frequency threshold hides it. A day that
            // only carries the previous night's tail marks no period (#718).
            partialWeekdayPeriods: partialWeekday
                // 00:00-form times get the same +24 h copy the period headways use, so a
                // 00:30 departure counts toward the late period.
                ? TIME_PERIODS.filter(p => ownServiceEntries.some(e =>
                    forCrossMidnightWindow(e.rawTimes, p.endHour * 60).some(t => t >= p.startHour * 60 && t < p.endHour * 60))).map(p => p.key)
                : undefined,
            previousNightTailOnly: previousNightTailOnly || undefined,
            weekdayTierVariation: (weekdayTierVariation && !noTimetable) || undefined,
            edgeGapAllowance: (() => {
                const sides = new Set(entries.map(e => e.result.edgeGapAllowance).filter(Boolean));
                return sides.size > 1 ? 'both' : [...sides][0];
            })(),
            // Partial-weekday routes are limited service: the "hide limited" toggle hides them
            // on every surface (map, lists, counts), like any other time-limited route (#710).
            serviceClass: partialWeekday ? 'time-limited' : serviceClass,
            tripCount: avgTrips,
            gaps: stats.gaps,
            times: rollupTimes,
            reliabilityScore: stats.reliabilityScore,
            consistencyScore: stats.consistencyScore || 0,
            bunchingPenalty: stats.bunchingPenalty || 0,
            outlierPenalty: stats.outlierPenalty || 0,
            headwayVariance: stats.variance,
            bunchingFactor: stats.bunchingFactor,
            routeType: rep.routeType,
            modeName: rep.modeName,
            railLike: isRailRollup,
            serviceIds: allServiceIds,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
            daysIncluded,
            headsign: rep.headsign,
            routeVariant: rep.routeVariant,
            shapeId: rep.shapeId,
            routeVariant: rep.routeVariant,
            ...resourceStats
        });
    }

    return results;
}

/**
 * Legacy API — wraps computeRawDepartures + applyAnalysisCriteria.
 */
export const calculateTiers = (
    gtfs: GtfsData,
    startTimeMins: number,
    endTimeMins: number
): AnalysisResult[] => {
    const rawData = computeRawDepartures(gtfs);
    const criteria: AnalysisCriteria = {
        ...DEFAULT_CRITERIA,
        dayTypes: {
            Weekday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: SURFACE_TIER_MAXES },
            Saturday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: SURFACE_TIER_MAXES },
            Sunday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: SURFACE_TIER_MAXES },
        },
    };
    return applyAnalysisCriteria(rawData, criteria);
};
