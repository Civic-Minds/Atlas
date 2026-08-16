import {
    GtfsData,
    AnalysisResult,
    RawRouteDepartures,
    AnalysisCriteria,
    DayType,
    DayName,
    WEEKDAYS,
    DAY_TO_TYPE,
} from '../types/gtfs';
import { computeMedian } from './transit-utils';
import { DEFAULT_CRITERIA, getTiersForCriteria } from './defaults';
import { SURFACE_TIER_MAXES, TIME_PERIODS } from '../shared/config.js';
import { computeRawDepartures } from './transit-phase1';

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
    maxGraceViolations: number = 2,
    gracePercent: number = 0.15,
    violationPercent: number = 0.30,
): string => {
    for (const T of tiers) {
        const grace = Math.max(graceMinutes, Math.round(T * gracePercent));
        const allowedViolations = Math.max(maxGraceViolations, Math.floor(headways.length * violationPercent));
        const minTrips = Math.ceil(spanMinutes / T);
        if (tripCount < minTrips) continue;

        let graceCount = 0;
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
 * Phase 2: Apply analysis criteria to raw departure data.
 *
 * Filters departures to each day type's time window, classifies into tiers,
 * then rolls up individual days into Weekday/Saturday/Sunday summaries.
 * Weekday rollup uses the WORST tier across Mon–Fri.
 */
export function applyAnalysisCriteria(
    rawData: RawRouteDepartures[],
    criteria: AnalysisCriteria = DEFAULT_CRITERIA
): AnalysisResult[] {
    const perDayResults = new Map<string, { dayType: DayType; day: DayName; result: AnalysisResult }>();

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
        const isRail = raw.routeType === '2';
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
        const determinedTier = determineTier(
            analysisGaps,
            analysisWindow.length,
            spanMins,
            tiers,
            criteria.graceMinutes,
            criteria.maxGraceViolations,
            criteria.gracePercent,
            criteria.violationPercent,
        );
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
            serviceIds: raw.serviceIds,
            warnings: isOvernightFallback
                ? [...(raw.warnings ?? []), 'Overnight-only service (outside daytime analysis window)']
                : raw.warnings,
            daysIncluded: [raw.day],
            headsign: raw.headsign,
            ...resourceStats
        };
        perDayResults.set(`${raw.route}::${raw.dir}::${raw.headsign ?? ''}::${raw.day}`, { dayType, day: raw.day, result });
    }

    // Roll up per-day results into day-type summaries
    const rollupGroups = new Map<string, { dayType: DayType; entries: { day: DayName; result: AnalysisResult }[] }>();
    for (const [, entry] of perDayResults) {
        const key = `${entry.result.route}::${entry.result.dir}::${entry.result.headsign ?? ''}::${entry.dayType}`;
        if (!rollupGroups.has(key)) rollupGroups.set(key, { dayType: entry.dayType, entries: [] });
        rollupGroups.get(key)!.entries.push({ day: entry.day, result: entry.result });
    }

    const results: AnalysisResult[] = [];

    for (const [, group] of rollupGroups) {
        const { dayType, entries } = group;
        if (entries.length === 0) continue;

        const INFREQUENT_VAL = 1e6; // sentinel: worse than any real tier, better than span (Infinity)
        const tierValues = entries.map(e =>
            e.result.tier === 'span' ? Infinity
            : e.result.tier === 'infrequent' ? INFREQUENT_VAL
            : parseInt(e.result.tier)
        );
        const worstTierValue = Math.max(...tierValues);
        const worstTier = worstTierValue === Infinity ? 'span'
            : worstTierValue >= INFREQUENT_VAL ? 'infrequent'
            : String(worstTierValue);
        const serviceClass = entries.some(e => e.result.serviceClass === 'irregular')
            ? 'irregular'
            : entries.some(e => e.result.serviceClass === 'time-limited')
            ? 'time-limited'
            : 'regular';

        const allTimes = entries.flatMap(e => e.result.times);
        const mergedTimes = [...new Set(allTimes)].sort((a, b) => a - b);
        const rep = entries[0].result;
        // Rail rollup: same midday representative-day logic for both directions.
        // For dir=0 (outbound): avoids Friday extra-train distortion.
        // For dir=1 (inbound): all trains share "Union Station" headsign so the pool is the
        // same across weekdays; representative-day pick is still valid.
        const isRailRollup = rep.routeType === '2';
        const rollupStatsBase = (() => {
          if (isRailRollup) {
            // Union of all weekdays creates spurious short gaps when some days (e.g. Fridays)
            // run extra trains. Pick the "representative day" — the day whose midday trip count
            // is closest to the median count across all days — and use only its times.
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
          return mergedTimes;
        })();
        const stats = computeHeadwayStats(rollupStatsBase);
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
            tier: worstTier,
            serviceClass,
            tripCount: avgTrips,
            gaps: stats.gaps,
            times: mergedTimes,
            reliabilityScore: stats.reliabilityScore,
            consistencyScore: stats.consistencyScore || 0,
            bunchingPenalty: stats.bunchingPenalty || 0,
            outlierPenalty: stats.outlierPenalty || 0,
            headwayVariance: stats.variance,
            bunchingFactor: stats.bunchingFactor,
            routeType: rep.routeType,
            modeName: rep.modeName,
            serviceIds: allServiceIds,
            warnings: allWarnings.length > 0 ? allWarnings : undefined,
            daysIncluded,
            headsign: rep.headsign,
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
