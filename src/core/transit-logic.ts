import { haversineDistance } from './utils';
import {
    GtfsData,
    GtfsCalendar,
    GtfsCalendarDate,
    GtfsFrequency,
    AnalysisResult,
    CorridorResult,
    SpacingResult,
    RawRouteDepartures,
    AnalysisCriteria,
    DayName,
    DayType,
    ALL_DAYS,
    WEEKDAYS,
    DAY_TO_TYPE,
} from '../types/gtfs';
import { DEFAULT_CRITERIA, getTiersForCriteria } from './defaults';

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Converts HH:MM:SS string to minutes from beginning of day
 */
export const t2m = (s: string): number | null => {
    const p = (s || '').split(':');
    if (p.length < 2) return null;
    const mins = (+p[0]) * 60 + (+p[1]);
    return Number.isNaN(mins) ? null : mins;
};

/**
 * Converts minutes from beginning of day to HH:MM string
 */
export const m2t = (m: number): string => {
    const h = Math.floor(m / 60);
    const mm = String(m % 60).padStart(2, '0');
    return `${String(h).padStart(2, '0')}:${mm}`;
};

/**
 * Computes the median of an array of numbers
 */
export const computeMedian = (arr: number[]): number => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * GTFS route_type mode mapping
 */
const MODE_MAP: Record<string, string> = {
    '0': 'Tram/Light Rail',
    '1': 'Subway/Metro',
    '2': 'Commuter Rail',
    '3': 'Bus',
    '4': 'Ferry',
    '5': 'Cable Tram',
    '6': 'Gondola',
    '7': 'Funicular',
    '11': 'Trolleybus',
    '12': 'Monorail',
};

export const getModeName = (routeType: string): string =>
    MODE_MAP[routeType] || 'Transit';

// ---------------------------------------------------------------------------
// Calendar day mapping — maps DayName to the GtfsCalendar field name
// ---------------------------------------------------------------------------

const DAY_FIELD_MAP: Record<DayName, keyof GtfsCalendar> = {
    Monday: 'monday',
    Tuesday: 'tuesday',
    Wednesday: 'wednesday',
    Thursday: 'thursday',
    Friday: 'friday',
    Saturday: 'saturday',
    Sunday: 'sunday',
};

// ---------------------------------------------------------------------------
// Phase 1: Raw Extraction
// ---------------------------------------------------------------------------

/**
 * Auto-detect a reference date from the feed's calendar data.
 * Returns the midpoint of the latest-starting service period, formatted as YYYYMMDD.
 * Falls back to today if no calendar entries exist.
 */
function detectReferenceDate(calendar: GtfsCalendar[]): string {
    if (calendar.length === 0) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    // Find the latest start_date and its corresponding end_date — this is
    // most likely the "current" schedule in feeds with multiple periods.
    let best = calendar[0];
    for (const cal of calendar) {
        if (cal.start_date > best.start_date) best = cal;
    }

    // Use midpoint of that service period
    const sy = parseInt(best.start_date.substring(0, 4));
    const sm = parseInt(best.start_date.substring(4, 6)) - 1;
    const sd = parseInt(best.start_date.substring(6, 8));
    const ey = parseInt(best.end_date.substring(0, 4));
    const em = parseInt(best.end_date.substring(4, 6)) - 1;
    const ed = parseInt(best.end_date.substring(6, 8));

    const startMs = new Date(sy, sm, sd).getTime();
    const endMs = new Date(ey, em, ed).getTime();
    const mid = new Date((startMs + endMs) / 2);

    const ry = mid.getFullYear();
    const rm = String(mid.getMonth() + 1).padStart(2, '0');
    const rd = String(mid.getDate()).padStart(2, '0');
    return `${ry}${rm}${rd}`;
}

/**
 * Determines which service_ids are active on a specific day, accounting for
 * both calendar.txt and calendar_dates.txt exceptions.
 *
 * When a referenceDate (YYYYMMDD) is provided, only includes services from
 * calendar.txt whose [start_date, end_date] range contains the reference date.
 * This prevents merging trips from non-overlapping schedule periods (e.g.
 * summer and winter schedules) into the same day.
 */
function getActiveServiceIds(
    calendar: GtfsCalendar[],
    calendarDates: GtfsCalendarDate[],
    day: DayName,
    referenceDate?: string
): Set<string> {
    const field = DAY_FIELD_MAP[day];
    const active = new Set<string>();

    // All service_ids present in calendar.txt
    const calendarServiceIds = new Set(calendar.map(c => c.service_id));

    // Step 1: Add service_ids that are active on this day per calendar.txt,
    // filtered to only services whose date range contains the reference date.
    for (const cal of calendar) {
        if (cal[field] !== '1') continue;
        if (referenceDate && (referenceDate < cal.start_date || referenceDate > cal.end_date)) continue;
        active.add(cal.service_id);
    }

    // Step 2: Include services that exist ONLY in calendar_dates.txt (not in
    // calendar.txt). When both files exist, synthesizeCalendarFromDates doesn't
    // run, so these services would be invisible without this step.
    // We check if any exception_type=1 dates for such services fall on this
    // day-of-week, and if so, include the service.
    // When a referenceDate is provided, only consider calendar_dates entries
    // that fall within the same schedule period (within 90 days of reference).
    const DOW_NAMES: DayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const cd of calendarDates) {
        if (calendarServiceIds.has(cd.service_id)) continue;
        if (cd.exception_type !== '1') continue;

        // Skip dates far from the reference date to avoid mixing schedule periods
        if (referenceDate) {
            const diff = Math.abs(parseInt(cd.date) - parseInt(referenceDate));
            // Rough check: YYYYMMDD difference > ~90 days ≈ 90 in the DD digits,
            // but date math isn't linear in YYYYMMDD. Use proper date diff.
            const cy = parseInt(cd.date.substring(0, 4));
            const cm = parseInt(cd.date.substring(4, 6)) - 1;
            const cDay = parseInt(cd.date.substring(6, 8));
            const ry = parseInt(referenceDate.substring(0, 4));
            const rm = parseInt(referenceDate.substring(4, 6)) - 1;
            const rDay = parseInt(referenceDate.substring(6, 8));
            const diffDays = Math.abs(new Date(cy, cm, cDay).getTime() - new Date(ry, rm, rDay).getTime()) / 86400000;
            if (diffDays > 90) continue;
        }

        const y = parseInt(cd.date.substring(0, 4));
        const m = parseInt(cd.date.substring(4, 6)) - 1;
        const d = parseInt(cd.date.substring(6, 8));
        const dow = new Date(y, m, d).getDay();
        if (DOW_NAMES[dow] === day) {
            active.add(cd.service_id);
        }
    }

    return active;
}

/**
 * Expand frequency-based trips into individual departure times.
 * For each frequency entry, generates departures from start_time to end_time
 * at headway_secs intervals. Returns a map of trip_id → array of departure
 * time offsets (in minutes) from the template trip's first stop.
 */
function expandFrequencies(
    frequencies: GtfsFrequency[] | undefined
): Map<string, number[]> {
    const expanded = new Map<string, number[]>();
    if (!frequencies || frequencies.length === 0) return expanded;

    // Group frequency entries by trip_id (a trip can have multiple time ranges)
    const byTrip = new Map<string, GtfsFrequency[]>();
    for (const freq of frequencies) {
        if (!byTrip.has(freq.trip_id)) byTrip.set(freq.trip_id, []);
        byTrip.get(freq.trip_id)!.push(freq);
    }

    for (const [tripId, entries] of byTrip) {
        const departures: number[] = [];
        for (const freq of entries) {
            const startMins = t2m(freq.start_time);
            const endMins = t2m(freq.end_time);
            const headwaySecs = parseInt(freq.headway_secs);
            if (startMins === null || endMins === null || Number.isNaN(headwaySecs) || headwaySecs <= 0) continue;

            const headwayMins = headwaySecs / 60;
            for (let t = startMins; t < endMins; t += headwayMins) {
                departures.push(t);
            }
        }
        if (departures.length > 0) {
            expanded.set(tripId, departures);
        }
    }

    return expanded;
}

/**
 * Builds a map of trip_id → origin departure time (minutes from midnight).
 * Origin = the stop with the lowest stop_sequence for that trip.
 *
 * For frequency-based trips (those listed in frequencies.txt), the single
 * template departure is expanded into multiple departures at the specified
 * headway intervals. Each expanded departure gets a synthetic trip_id.
 */
function buildTripDepartures(
    gtfs: GtfsData
): Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string }> {
    const { trips, stopTimes } = gtfs;

    // Group stop_times by trip_id, find first stop per trip
    const tripFirstDep = new Map<string, number>();
    const tripFirstSeq = new Map<string, number>();

    for (const st of stopTimes) {
        const seq = parseInt(st.stop_sequence);
        if (Number.isNaN(seq)) continue;
        const existing = tripFirstSeq.get(st.trip_id);
        if (existing === undefined || seq < existing) {
            const dep = t2m(st.departure_time);
            if (dep !== null) {
                tripFirstDep.set(st.trip_id, dep);
                tripFirstSeq.set(st.trip_id, seq);
            }
        }
    }

    // Expand frequency-based trips
    const freqExpanded = expandFrequencies(gtfs.frequencies);

    // Build result map
    const result = new Map<string, { depTime: number; routeId: string; dirId: string; serviceId: string }>();
    for (const trip of trips) {
        const baseDep = tripFirstDep.get(trip.trip_id);
        if (baseDep === undefined) continue;

        const tripMeta = {
            routeId: trip.route_id,
            dirId: trip.direction_id || '0',
            serviceId: trip.service_id,
        };

        const freqDeps = freqExpanded.get(trip.trip_id);
        if (freqDeps) {
            // Frequency-based: use expanded departures instead of the template
            for (let i = 0; i < freqDeps.length; i++) {
                result.set(`${trip.trip_id}__freq_${i}`, {
                    depTime: freqDeps[i],
                    ...tripMeta,
                });
            }
        } else {
            // Regular trip: use the stop_times departure directly
            result.set(trip.trip_id, {
                depTime: baseDep,
                ...tripMeta,
            });
        }
    }

    return result;
}

/**
 * Deduplicates exact duplicate departure times from overlapping service_ids.
 * Returns sorted, deduplicated array. Only removes exact matches (same minute),
 * preserving legitimately close departures on high-frequency routes.
 */
function deduplicateDepartures(times: number[]): number[] {
    if (times.length === 0) return [];
    const sorted = [...times].sort((a, b) => a - b);
    const result = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== result[result.length - 1]) {
            result.push(sorted[i]);
        }
    }
    return result;
}

/**
 * Phase 1: Extract raw departure data from GTFS.
 *
 * Produces one RawRouteDepartures per route/direction/day (individual days:
 * Monday through Sunday). No time window filtering, no tier classification.
 * All gaps are kept — nothing is silently filtered.
 */
export function computeRawDepartures(gtfs: GtfsData, referenceDate?: string): RawRouteDepartures[] {
    const { routes, calendar, calendarDates } = gtfs;
    const routeById = new Map(routes.map(r => [r.route_id, r]));
    const tripData = buildTripDepartures(gtfs);

    // Auto-detect reference date from feed if not provided
    const refDate = referenceDate ?? detectReferenceDate(calendar);

    const results: RawRouteDepartures[] = [];

    // For each individual day, determine active services and group trips
    for (const day of ALL_DAYS) {
        const activeServiceIds = getActiveServiceIds(calendar, calendarDates, day, refDate);
        if (activeServiceIds.size === 0) continue;

        // Group departures by route + direction
        const grouped = new Map<string, { times: number[]; serviceIds: Set<string> }>();

        for (const [, data] of tripData) {
            if (!activeServiceIds.has(data.serviceId)) continue;

            const key = `${data.routeId}::${data.dirId}`;
            if (!grouped.has(key)) {
                grouped.set(key, { times: [], serviceIds: new Set() });
            }
            const group = grouped.get(key)!;
            group.times.push(data.depTime);
            group.serviceIds.add(data.serviceId);
        }

        // Process each route/direction group
        for (const [key, group] of grouped) {
            const [routeId, dirId] = key.split('::');

            const departureTimes = deduplicateDepartures(group.times);
            if (departureTimes.length < 2) continue;

            // Compute ALL gaps — no filtering
            const gaps: number[] = [];
            for (let i = 1; i < departureTimes.length; i++) {
                gaps.push(departureTimes[i] - departureTimes[i - 1]);
            }

            const serviceIds = Array.from(group.serviceIds);
            const warnings: string[] = [];
            if (serviceIds.length > 1) {
                warnings.push(`Multiple service_ids (${serviceIds.join(', ')}) contribute trips on ${day}`);
            }

            const route = routeById.get(routeId);
            const routeType = route?.route_type || '3';

            results.push({
                route: routeId,
                dir: dirId,
                day,
                routeType,
                modeName: getModeName(routeType),
                departureTimes,
                gaps,
                serviceSpan: {
                    start: departureTimes[0],
                    end: departureTimes[departureTimes.length - 1],
                },
                tripCount: departureTimes.length,
                serviceIds,
                warnings,
            });
        }
    }

    return results;
}

// ---------------------------------------------------------------------------
// Phase 2: Criteria Application
// ---------------------------------------------------------------------------

/**
 * Determines the frequency tier for a route based on headway analysis.
 * All parameters are explicit — nothing hardcoded.
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
 * Compute headway statistics and reliability score from gaps.
 */
function computeHeadwayStats(gaps: number[], times: number[]) {
    const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    const median = computeMedian(gaps);

    // Peak detection: 2-hour sliding window, O(n) two-pointer
    let peakHeadway = avg;
    let peakWindow = { start: times[0], end: times[0] + 120 };
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
            for (let j = left + 1; j < right; j++) {
                peakGaps.push(times[j] - times[j - 1]);
            }
            peakHeadway = peakGaps.length ? peakGaps.reduce((a, b) => a + b, 0) / peakGaps.length : avg;
        }
    }

    // Reliability score (0-100)
    const variance = gaps.length > 1
        ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
        : 0;
    const stdDev = Math.sqrt(variance);
    const significantGaps = gaps.filter(g => g > avg * 1.5).length;
    const outlierPenalty = gaps.length ? (significantGaps / gaps.length) * 40 : 0;
    const bunchedGaps = gaps.filter(g => g < avg * 0.25).length;
    const bunchingFactor = bunchedGaps / (gaps.length || 1);
    const bunchingPenalty = bunchingFactor * 60;
    const consistency = avg > 0 ? Math.max(0, 100 - (stdDev / avg) * 50) : 0;
    const reliability = Math.max(0, consistency - outlierPenalty - bunchingPenalty);

    return {
        avg,
        median,
        peakHeadway: Math.round(peakHeadway * 10) / 10,
        peakWindow,
        variance: Math.round(variance * 10) / 10,
        bunchingFactor: Math.round(bunchingFactor * 100) / 100,
        reliabilityScore: Math.round(reliability),
    };
}

/**
 * Phase 2: Apply analysis criteria to raw departure data.
 *
 * For each raw entry (per individual day), filters departures to the time window,
 * classifies into tiers, then rolls up individual days into day-type summaries
 * (Weekday/Saturday/Sunday).
 *
 * Weekday rollup: uses the WORST tier across Mon-Fri for that route/direction.
 * This ensures "Weekday FTS @ 15min" means it passes on ALL weekdays.
 */
export function applyAnalysisCriteria(
    rawData: RawRouteDepartures[],
    criteria: AnalysisCriteria = DEFAULT_CRITERIA
): AnalysisResult[] {
    // Step 1: Compute per-individual-day results
    const perDayResults = new Map<string, { dayType: DayType; day: DayName; result: AnalysisResult }>();

    for (const raw of rawData) {
        const dayType = DAY_TO_TYPE[raw.day];
        const dayConfig = criteria.dayTypes[dayType];
        if (!dayConfig) continue;

        // Filter departures to time window
        const { start, end } = dayConfig.timeWindow;
        const windowedTimes = raw.departureTimes.filter(t => t >= start && t <= end);
        if (windowedTimes.length < 2) continue;

        // Recompute gaps within the windowed range
        const windowedGaps: number[] = [];
        for (let i = 1; i < windowedTimes.length; i++) {
            windowedGaps.push(windowedTimes[i] - windowedTimes[i - 1]);
        }

        // Use the full configured window span. This is intentional: earning a tier
        // means sustaining that frequency across the entire analysis window. A peak-only
        // route running every 5 min for 3 hours should NOT get a 5-min tier — a rider
        // arriving outside that window has no service.
        const spanMins = end - start;
        const tiers = getTiersForCriteria(raw.routeType, dayConfig.tiers, criteria.modeTierOverrides);
        const tier = determineTier(
            windowedGaps,
            windowedTimes.length,
            spanMins,
            tiers,
            criteria.graceMinutes,
            criteria.maxGraceViolations,
        );

        const stats = computeHeadwayStats(windowedGaps, windowedTimes);

        const key = `${raw.route}::${raw.dir}::${raw.day}`;
        perDayResults.set(key, {
            dayType,
            day: raw.day,
            result: {
                route: raw.route,
                day: raw.day,
                dir: raw.dir,
                avgHeadway: stats.avg,
                medianHeadway: stats.median,
                peakHeadway: stats.peakHeadway,
                baseHeadway: Math.round(stats.avg * 10) / 10,
                peakWindow: stats.peakWindow,
                serviceSpan: { start: windowedTimes[0], end: windowedTimes[windowedTimes.length - 1] },
                tier,
                tripCount: windowedTimes.length,
                gaps: windowedGaps,
                times: windowedTimes,
                reliabilityScore: stats.reliabilityScore,
                headwayVariance: stats.variance,
                bunchingFactor: stats.bunchingFactor,
                routeType: raw.routeType,
                modeName: raw.modeName,
                serviceIds: raw.serviceIds,
                warnings: raw.warnings,
                daysIncluded: [raw.day],
            },
        });
    }

    // Step 2: Roll up into day-type summaries (Weekday/Saturday/Sunday)
    // Group per-day results by route/dir/dayType
    const rollupGroups = new Map<string, { dayType: DayType; entries: { day: DayName; result: AnalysisResult }[] }>();

    for (const [, entry] of perDayResults) {
        const key = `${entry.result.route}::${entry.result.dir}::${entry.dayType}`;
        if (!rollupGroups.has(key)) {
            rollupGroups.set(key, { dayType: entry.dayType, entries: [] });
        }
        rollupGroups.get(key)!.entries.push({ day: entry.day, result: entry.result });
    }

    const results: AnalysisResult[] = [];

    for (const [, group] of rollupGroups) {
        const { dayType, entries } = group;

        if (entries.length === 0) continue;

        // For weekdays: use the WORST (highest number = least frequent) tier
        // For Saturday/Sunday: just use the single day's result
        const tierValues = entries.map(e => {
            const t = e.result.tier;
            return t === 'span' ? Infinity : parseInt(t);
        });
        const worstTierValue = Math.max(...tierValues);
        const worstTier = worstTierValue === Infinity ? 'span' : String(worstTierValue);

        // Aggregate stats: compute per-day then average, rather than merging
        // raw gaps from all days (which would produce inconsistent peak detection
        // and inflated sample sizes).
        const perDayStats = entries.map(e =>
            e.result.gaps.length > 0
                ? computeHeadwayStats(e.result.gaps, e.result.times)
                : { avg: 0, median: 0, peakHeadway: 0, peakWindow: { start: 0, end: 0 }, variance: 0, bunchingFactor: 0, reliabilityScore: 0 }
        );
        const n = perDayStats.length;
        const stats = {
            avg: perDayStats.reduce((s, d) => s + d.avg, 0) / n,
            median: perDayStats.reduce((s, d) => s + d.median, 0) / n,
            peakHeadway: perDayStats.reduce((s, d) => s + d.peakHeadway, 0) / n,
            peakWindow: perDayStats[0].peakWindow, // use representative day
            variance: perDayStats.reduce((s, d) => s + d.variance, 0) / n,
            bunchingFactor: perDayStats.reduce((s, d) => s + d.bunchingFactor, 0) / n,
            reliabilityScore: Math.round(perDayStats.reduce((s, d) => s + d.reliabilityScore, 0) / n),
        };

        // Keep merged gaps/times for downstream consumers that need the full dataset
        const allGaps = entries.flatMap(e => e.result.gaps);
        const allTimes = entries.flatMap(e => e.result.times);
        const totalTrips = entries.reduce((sum, e) => sum + e.result.tripCount, 0);
        const avgTrips = Math.round(totalTrips / entries.length);

        // Use first entry as representative for metadata
        const rep = entries[0].result;

        // Collect all service spans
        const allStarts = entries.map(e => e.result.serviceSpan?.start ?? 0);
        const allEnds = entries.map(e => e.result.serviceSpan?.end ?? 0);

        // Collect all warnings and service IDs
        const allServiceIds = [...new Set(entries.flatMap(e => e.result.serviceIds || []))];
        const allWarnings = [...new Set(entries.flatMap(e => e.result.warnings || []))];
        const daysIncluded = entries.map(e => e.day);

        // For weekday rollup: warn if not all 5 weekdays are present
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
            baseHeadway: Math.round(stats.avg * 10) / 10,
            peakWindow: stats.peakWindow,
            serviceSpan: { start: Math.min(...allStarts), end: Math.max(...allEnds) },
            tier: worstTier,
            tripCount: avgTrips,
            gaps: allGaps,
            times: [...new Set(allTimes)].sort((a, b) => a - b),
            reliabilityScore: stats.reliabilityScore,
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

// ---------------------------------------------------------------------------
// Backward-compatible wrapper
// ---------------------------------------------------------------------------

/**
 * Legacy API — wraps computeRawDepartures + applyAnalysisCriteria.
 * Produces identical output shape so existing tests and UI continue working.
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

// ---------------------------------------------------------------------------
// Corridor Analysis (unchanged from original)
// ---------------------------------------------------------------------------

/**
 * Identifies shared road segments (links) and calculates aggregate frequency.
 */
export const calculateCorridors = (
    gtfs: GtfsData,
    day: string,
    startTimeMins: number,
    endTimeMins: number
): CorridorResult[] => {
    const { trips, stopTimes, calendar } = gtfs;
    const serviceById = new Map(calendar.map(c => [c.service_id, c]));

    const activeTrips = new Set<string>();
    const tripToRoute = new Map<string, string>();

    for (const trip of trips) {
        const service = serviceById.get(trip.service_id);
        if (!service) continue;

        const isWeekday = service.monday === '1' || service.tuesday === '1' ||
            service.wednesday === '1' || service.thursday === '1' || service.friday === '1';
        const isMatch = (day === 'Weekday' && isWeekday) ||
            (day === 'Saturday' && service.saturday === '1') ||
            (day === 'Sunday' && service.sunday === '1');

        if (isMatch) {
            activeTrips.add(trip.trip_id);
            tripToRoute.set(trip.trip_id, trip.route_id);
        }
    }

    const linkMap = new Map<string, { times: number[], routes: Set<string>, stopA: string, stopB: string }>();

    const tripSequences = new Map<string, typeof stopTimes>();
    for (const st of stopTimes) {
        if (!activeTrips.has(st.trip_id)) continue;
        if (!tripSequences.has(st.trip_id)) tripSequences.set(st.trip_id, []);
        tripSequences.get(st.trip_id)!.push(st);
    }

    for (const [tripId, sequence] of tripSequences.entries()) {
        const sortedSeq = sequence.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
        const routeId = tripToRoute.get(tripId)!;

        for (let i = 0; i < sortedSeq.length - 1; i++) {
            const stA = sortedSeq[i];
            const stB = sortedSeq[i + 1];
            const depTime = t2m(stA.departure_time);

            if (depTime === null || depTime < startTimeMins || depTime > endTimeMins) continue;

            const linkId = `${stA.stop_id}->${stB.stop_id}`;
            if (!linkMap.has(linkId)) {
                linkMap.set(linkId, {
                    times: [],
                    routes: new Set(),
                    stopA: stA.stop_id,
                    stopB: stB.stop_id
                });
            }

            const linkData = linkMap.get(linkId)!;
            linkData.times.push(depTime);
            linkData.routes.add(routeId);
        }
    }

    const corridorResults: CorridorResult[] = [];
    for (const [linkId, data] of linkMap.entries()) {
        if (data.routes.size < 2) continue;

        const sortedTimes = Array.from(new Set(data.times)).sort((a, b) => a - b);
        if (sortedTimes.length < 2) continue;

        const gaps: number[] = [];
        for (let i = 1; i < sortedTimes.length; i++) {
            gaps.push(sortedTimes[i] - sortedTimes[i - 1]);
        }

        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;

        // O(n) two-pointer peak detection
        let maxTripsInWindow = 0;
        let peakAvg = avg;
        let rPtr = 0;
        for (let lPtr = 0; lPtr < sortedTimes.length; lPtr++) {
            const end = sortedTimes[lPtr] + 120;
            while (rPtr < sortedTimes.length && sortedTimes[rPtr] <= end) rPtr++;
            const count = rPtr - lPtr;
            if (count > maxTripsInWindow) {
                maxTripsInWindow = count;
                const pGaps = [];
                for (let j = lPtr + 1; j < rPtr; j++) pGaps.push(sortedTimes[j] - sortedTimes[j - 1]);
                peakAvg = pGaps.length ? pGaps.reduce((a, b) => a + b, 0) / pGaps.length : avg;
            }
        }

        const corrVariance = gaps.length > 1
            ? gaps.reduce((acc, h) => acc + Math.pow(h - avg, 2), 0) / (gaps.length - 1)
            : 0;
        const corrStdDev = Math.sqrt(corrVariance);
        const corrConsistency = avg > 0 ? Math.max(0, 100 - (corrStdDev / avg) * 50) : 0;
        const corrSignificantGaps = gaps.filter(g => g > avg * 1.5).length;
        const corrOutlierPenalty = (corrSignificantGaps / gaps.length) * 40;
        const corrBunchedGaps = gaps.filter(g => g < avg * 0.25).length;
        const corrBunchingFactor = corrBunchedGaps / (gaps.length || 1);
        const corrBunchingPenalty = corrBunchingFactor * 60;
        const corrReliability = Math.max(0, corrConsistency - corrOutlierPenalty - corrBunchingPenalty);

        corridorResults.push({
            linkId,
            stopA: data.stopA,
            stopB: data.stopB,
            routeIds: Array.from(data.routes),
            tripCount: sortedTimes.length,
            avgHeadway: Math.round(avg * 10) / 10,
            peakHeadway: Math.round(peakAvg * 10) / 10,
            reliabilityScore: Math.round(corrReliability)
        });
    }

    return corridorResults.sort((a, b) => a.avgHeadway - b.avgHeadway);
};

// ---------------------------------------------------------------------------
// Stop Spacing Analysis (unchanged from original)
// ---------------------------------------------------------------------------

/**
 * Calculates stop spacing and identifies redundant pairs.
 */
export const calculateStopSpacing = (
    gtfs: GtfsData,
    routeId: string,
    directionId: string = '0'
): SpacingResult | null => {
    const { trips, stopTimes, stops } = gtfs;

    const trip = trips.find(t => t.route_id === routeId && (t.direction_id || '0') === directionId);
    if (!trip) return null;

    const tripStopTimes = stopTimes
        .filter(st => st.trip_id === trip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    const stopMap = new Map(stops.map(s => [s.stop_id, s]));
    const routeStops = tripStopTimes
        .map(st => stopMap.get(st.stop_id))
        .filter(Boolean);

    if (routeStops.length < 2) return null;

    const distances: number[] = [];
    const redundantPairs: SpacingResult['redundantPairs'] = [];
    const RADIUS = 400;

    for (let i = 1; i < routeStops.length; i++) {
        const sA = routeStops[i - 1];
        const sB = routeStops[i];
        if (!sA || !sB) continue;

        const latA = parseFloat(sA.stop_lat);
        const lonA = parseFloat(sA.stop_lon);
        const latB = parseFloat(sB.stop_lat);
        const lonB = parseFloat(sB.stop_lon);
        if (Number.isNaN(latA) || Number.isNaN(lonA) || Number.isNaN(latB) || Number.isNaN(lonB)) continue;

        const dist = haversineDistance(latA, lonA, latB, lonB);

        distances.push(dist);

        if (dist < RADIUS) {
            redundantPairs.push({
                stopA: sA.stop_id,
                stopAName: sA.stop_name,
                stopB: sB.stop_id,
                stopBName: sB.stop_name,
                distance: Math.round(dist)
            });
        }
    }

    const avgSpacing = distances.reduce((a, b) => a + b, 0) / distances.length;
    const medianSpacing = computeMedian(distances);

    return {
        route: routeId,
        direction: directionId,
        avgSpacing: Math.round(avgSpacing),
        medianSpacing: Math.round(medianSpacing),
        totalStops: routeStops.length,
        redundantPairs
    };
};
