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
import { computeRawDepartures } from './transit-phase1';

/**
 * Determines the frequency tier for a route based on headway analysis.
 * Returns the tightest tier the route sustains across the full span.
 */
export const determineTier = (
    headways: number[],
    tripCount: number,
    spanMinutes: number,
    tiers: number[] = [10, 15, 20, 30, 60],
    graceMinutes: number = 5,
    maxGraceViolations: number = 2,
): string => {
    for (const T of tiers) {
        const minTrips = Math.ceil(spanMinutes / T);
        if (tripCount < minTrips) continue;

        let graceCount = 0;
        let fail = false;
        for (const h of headways) {
            if (h <= T) continue;
            if (h <= T + graceMinutes) {
                graceCount++;
                if (graceCount > maxGraceViolations) { fail = true; break; }
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
        const windowedTimes = raw.departureTimes.filter(t => t >= start && t <= end);
        if (windowedTimes.length < 2) continue;

        const windowedGaps: number[] = [];
        for (let i = 1; i < windowedTimes.length; i++) {
            windowedGaps.push(windowedTimes[i] - windowedTimes[i - 1]);
        }

        // Use the actual service span (first → last departure within window), not
        // the window width. A route running 08:00–18:00 at 10-min headway has 60
        // trips and a 600-min span — it should qualify for T=10 (minTrips=60).
        // Using the full 900-min window would require 90 trips and silently
        // downgrade it to T=15.
        const spanMins = windowedTimes[windowedTimes.length - 1] - windowedTimes[0];
        const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, criteria.modeTierOverrides);
        const tier = determineTier(windowedGaps, windowedTimes.length, spanMins, tiers, criteria.graceMinutes, criteria.maxGraceViolations);
        const stats = computeHeadwayStats(windowedTimes);

        const result: AnalysisResult = {
            route: raw.route,
            day: dayType,
            dir: raw.dir,
            avgHeadway: Math.round(stats.avg),
            medianHeadway: Math.round(stats.median),
            tier,
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
            serviceSpan: raw.serviceSpan,
            routeType: raw.routeType,
            modeName: raw.modeName,
            serviceIds: raw.serviceIds,
            warnings: raw.warnings,
            daysIncluded: [raw.day],
        };
        perDayResults.set(`${raw.route}::${raw.dir}::${raw.day}`, { dayType, day: raw.day, result });
    }

    // Roll up per-day results into day-type summaries
    const rollupGroups = new Map<string, { dayType: DayType; entries: { day: DayName; result: AnalysisResult }[] }>();
    for (const [, entry] of perDayResults) {
        const key = `${entry.result.route}::${entry.result.dir}::${entry.dayType}`;
        if (!rollupGroups.has(key)) rollupGroups.set(key, { dayType: entry.dayType, entries: [] });
        rollupGroups.get(key)!.entries.push({ day: entry.day, result: entry.result });
    }

    const results: AnalysisResult[] = [];

    for (const [, group] of rollupGroups) {
        const { dayType, entries } = group;
        if (entries.length === 0) continue;

        const tierValues = entries.map(e => e.result.tier === 'span' ? Infinity : parseInt(e.result.tier));
        const worstTierValue = Math.max(...tierValues);
        const worstTier = worstTierValue === Infinity ? 'span' : String(worstTierValue);

        // Build a merged schedule: deduplicate and sort departure times across all
        // days in the group, then derive all stats from that single merged series.
        // This keeps gaps, times, avgHeadway, and all other stats self-consistent —
        // previously gaps was a flatMap of per-day gaps while times was a Set-deduped
        // union, causing gaps ≠ diff(times) and avgHeadway ≠ avg(gaps).
        const allTimes = entries.flatMap(e => e.result.times);
        const mergedTimes = [...new Set(allTimes)].sort((a, b) => a - b);
        const stats = computeHeadwayStats(mergedTimes);
        const avgTrips = Math.round(entries.reduce((sum, e) => sum + e.result.tripCount, 0) / entries.length);
        const rep = entries[0].result;
        const allStarts = entries.map(e => e.result.serviceSpan?.start ?? 0);
        const allEnds = entries.map(e => e.result.serviceSpan?.end ?? 0);
        const allServiceIds = [...new Set(entries.flatMap(e => e.result.serviceIds || []))];
        const allWarnings = [...new Set(entries.flatMap(e => e.result.warnings || []))];
        const daysIncluded = entries.map(e => e.day);

        if (dayType === 'Weekday' && daysIncluded.length < 5) {
            const missing = WEEKDAYS.filter(d => !daysIncluded.includes(d));
            allWarnings.push(`Only runs ${daysIncluded.length}/5 weekdays (missing: ${missing.join(', ')})`);
        }

        results.push({
            route: rep.route,
            day: dayType,
            dir: rep.dir,
            avgHeadway: stats.avg,
            medianHeadway: stats.median,
            peakHeadway: stats.peakHeadway,
            baseHeadway: Math.round(stats.baseHeadway * 10) / 10,
            peakWindow: stats.peakWindow,
            serviceSpan: { start: Math.min(...allStarts), end: Math.max(...allEnds) },
            tier: worstTier,
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
            Weekday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: [10, 15, 20, 30, 60] },
            Saturday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: [10, 15, 20, 30, 60] },
            Sunday: { timeWindow: { start: startTimeMins, end: endTimeMins }, tiers: [10, 15, 20, 30, 60] },
        },
    };
    return applyAnalysisCriteria(rawData, criteria);
};
