import JSZip from 'jszip';
import Papa from 'papaparse';
import { GtfsData, GtfsShape, GtfsCalendar, GtfsCalendarDate, GtfsAgency, GtfsFareAttribute, GtfsFareRule, GtfsFareProduct, GtfsRiderCategory, GtfsFareLegRule, ShapeAnomaly } from '../types/gtfs';
import { haversineDistance, bearing, bearingDiff } from './utils.js';

/**
 * Parse a CSV string into an array of typed objects.
 */
export const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: (value: string) => value.trim(),
        // Strip surrounding quotes and leading BOM from header names.
        // Some agencies (e.g. Saint John Transit, Metrolink, OCTA) wrap headers in double
        // quotes: `"agency_name"` instead of `agency_name`. Others (e.g. Kingston Transit)
        // emit a UTF-8 BOM (\uFEFF) at the start of the file, which lands on the first
        // column header. Without stripping both, all field lookups return undefined silently.
        transformHeader: (header: string) => header.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''),
    });
    return result.data as T[];
};

/**
 * Some feeds have a single corrupted shapes.txt jump — one pair of consecutive
 * points, after sorting by shape_pt_sequence, implausibly far apart relative to
 * the rest of the shape (e.g. Mi Transporte Guadalajara's T14B_r2, #219: a
 * ~16.7km jump on an otherwise ~50m-spaced shape). Truncate at the first such
 * jump — a partial, geographically coherent line beats rendering a straight
 * segment across the whole city. Only fires on a dramatic, unambiguous outlier
 * against sane surrounding data, so well-formed shapes (including sparse rail
 * corridors with naturally longer gaps throughout) are unaffected.
 */
export function truncateAtImplausibleJump(points: [number, number][]): [number, number][] {
    if (points.length < 4) return points;

    const segLens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        segLens.push(haversineDistance(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
    }
    const sorted = [...segLens].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= 0) return points;

    const ABSOLUTE_THRESHOLD_M = 2000;
    const RELATIVE_MULTIPLE = 15;
    for (let i = 0; i < segLens.length; i++) {
        if (segLens[i] > ABSOLUTE_THRESHOLD_M && segLens[i] > median * RELATIVE_MULTIPLE) {
            return points.slice(0, i + 1);
        }
    }
    return points;
}

/**
 * Some feeds publish multiple points sharing the same shape_pt_sequence value —
 * e.g. two distinct physical paths concatenated under one shape_id with
 * independently-numbered, colliding sequences (Mi Transporte Guadalajara's
 * T14B_r1, #244: 317 of 382 distinct sequence numbers appear twice, each
 * pointing to a different location). Sorting by sequence alone interleaves
 * both paths into a single zigzag. When a sequence number has multiple
 * candidate points, keep whichever is spatially nearest the previously
 * selected point, so the result stays on one continuous path. No effect on
 * well-formed shapes, which never have duplicate sequence numbers to begin
 * with — this only changes behavior for feeds with this specific defect.
 */
export function deinterleaveDuplicateSequences(pts: { seq: number; lat: number; lon: number }[]): [number, number][] {
    const bySeq = new Map<number, { lat: number; lon: number }[]>();
    for (const p of pts) {
        const candidates = bySeq.get(p.seq) ?? [];
        candidates.push(p);
        bySeq.set(p.seq, candidates);
    }

    let previous: { lat: number; lon: number } | null = null;
    const points: [number, number][] = [];
    for (const seq of [...bySeq.keys()].sort((a, b) => a - b)) {
        const candidates = bySeq.get(seq)!;
        const selected = previous
            ? candidates.reduce((best, candidate) => {
                const bestDist = (best.lat - previous!.lat) ** 2 + (best.lon - previous!.lon) ** 2;
                const candidateDist = (candidate.lat - previous!.lat) ** 2 + (candidate.lon - previous!.lon) ** 2;
                return candidateDist < bestDist ? candidate : best;
            })
            : candidates[0];
        points.push([selected.lat, selected.lon]);
        previous = selected;
    }
    return points;
}

/**
 * Finds index ranges where two coherent physical sub-paths are interleaved
 * under one shape_id via unique, non-duplicate shape_pt_sequence numbers --
 * so neither truncateAtImplausibleJump (one dominant jump) nor
 * deinterleaveDuplicateSequences (tied sequence numbers) catches it. Real
 * examples (Nancy Réseau Stan): points head north for a stretch, snap back
 * to rejoin a second path heading a different direction, then snap back
 * again later -- the path direction reverses (a real Nancy example measured
 * a 174° turn at the snap), not just a long segment.
 *
 * An earlier version of this check flagged any implausibly-long segment
 * relative to the shape's median spacing. That produced heavy false positives
 * on densely-sampled feeds (e.g. Rennes, median ~11m spacing): a long-but-straight
 * segment across a bridge or open area is 8x+ the median without being corrupt
 * at all -- verified by comparing turn angles directly: real corruption showed
 * a ~174° reversal at the flagged point, while Rennes's flagged points never
 * exceeded 34°, and visually its routes traced the street grid fine. The fix
 * is to also require the flagged segment's bearing to reverse sharply relative
 * to the path's incoming direction -- a long straight segment doesn't turn,
 * a genuine interleaved sub-path does.
 *
 * Each returned [start, end] pair marks a jump FROM start TO start+1 and a
 * jump FROM end TO end+1, both anomalous -- i.e. points start+1..end are the
 * interleaved detour sitting between two points that should connect directly.
 *
 * Deliberately requires MIN_CLUSTER >= 2 reversals close together, not just one.
 * An isolated single reversal (no second one nearby) is exactly what a genuine
 * street-corner turn or terminus loop looks like too, and there's no reliable
 * way to tell them apart generally: tried gating on "does excising the point
 * shorten the path enough" (a misplaced point creates a detour; a real turn
 * doesn't), checked against live TTC/WMATA/TransLink data, and found a real TTC
 * route 101 terminus loop (into Downsview Park/Finch West stations) measuring
 * 30.6% bridge-savings -- almost indistinguishable from confirmed real isolated
 * corruption in Nancy at 33-88% savings. Too thin a margin to trust as a general
 * rule. Known isolated cases (Nancy STAN-68$70, STAN-75$53) are handled by the
 * narrowly-scoped KNOWN_ISOLATED_POINT_FIXES excision below instead, keyed to
 * those exact shape_ids -- not a general heuristic applied to every feed.
 */
function findClusteredJumpRanges(points: [number, number][]): Array<[number, number]> {
    if (points.length < 10) return [];

    const segLens: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        segLens.push(haversineDistance(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]));
    }
    const sorted = [...segLens].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;

    const ABSOLUTE_THRESHOLD_M = 100;
    const RELATIVE_MULTIPLE = 8;
    const TURN_THRESHOLD_DEG = 100;
    // A near-duplicate point (two points a few cm/inches apart -- common where a
    // feed snaps a shape point to a stop location) makes the incoming bearing
    // numerically meaningless, producing spurious ~180° "reversals" that are pure
    // noise, not a real turn. Found via a real TransLink shape (284016): a route
    // that's actually a straight north-south line, with one point duplicated
    // ~0.1m from its neighbor -- every known real corruption case's incoming
    // segment is 3.4m+, so this floor rejects only the noise.
    const MIN_INCOMING_SEGMENT_M = 2;
    const reversalIdxs: number[] = [];
    for (let i = 1; i < segLens.length - 1; i++) {
        if (segLens[i] <= ABSOLUTE_THRESHOLD_M || segLens[i] <= median * RELATIVE_MULTIPLE) continue;
        if (segLens[i - 1] <= MIN_INCOMING_SEGMENT_M) continue;
        const bIn = bearing(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
        const bJump = bearing(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
        if (bearingDiff(bIn, bJump) > TURN_THRESHOLD_DEG) reversalIdxs.push(i);
    }

    const WINDOW = 20;
    const MIN_CLUSTER = 2;
    const ranges: Array<[number, number]> = [];
    let i = 0;
    while (i < reversalIdxs.length) {
        let j = i;
        while (j + 1 < reversalIdxs.length && reversalIdxs[j + 1] - reversalIdxs[i] <= WINDOW) j++;
        if (j - i + 1 >= MIN_CLUSTER) ranges.push([reversalIdxs[i], reversalIdxs[j]]);
        i = j + 1;
    }
    return ranges;
}

/**
 * Specific, confirmed-real single-point corruption cases that the general
 * findClusteredJumpRanges deliberately doesn't catch (see its doc comment) --
 * a misplaced point in each of these two Nancy Réseau Stan shapes, verified
 * visually against the rendered map (routes T2 and Corol). Keyed by shape_id
 * and the exact published coordinate of the misplaced point, matched within
 * a small tolerance -- not by array index, which could shift if the upstream
 * feed's point count ever changes on refresh.
 */
const KNOWN_ISOLATED_POINT_FIXES: Record<string, [number, number][]> = {
    '10757$STAN-68$70': [[48.69601821899414, 6.123730182647705]],
    '10757$STAN-75$53': [
        [48.702552795410156, 6.131019115447998],
        [48.65890884399414, 6.177466869354248],
        [48.67235565185547, 6.160637855529785],
        [48.67512512207031, 6.1585187911987305],
    ],
    // Found via a full sweep of every Nancy shape for isolated single reversals
    // after the two above were fixed but a route T2 variant (STAN-67$16) still
    // showed a visible break on the rendered map -- these three plus the four
    // above are the only candidates whose bridge-savings (33-90%) matches the
    // confirmed-real range; four other candidates found in the same sweep
    // scored 1.7-3.1% savings (the same near-noise signature as false positives
    // found elsewhere) and are deliberately left alone.
    '10757$STAN-67$16': [
        [48.69740676879883, 6.119966983795166],
    ],
    '10757$STAN-76$100': [
        [48.67463302612305, 6.1587138175964355],
    ],
    '10757$STAN-19$23': [
        [48.717010498046875, 6.221489906311035],
    ],
};

export function excludeKnownIsolatedPoints(shapeId: string, points: [number, number][]): { points: [number, number][]; removed: boolean } {
    const targets = KNOWN_ISOLATED_POINT_FIXES[shapeId];
    if (!targets) return { points, removed: false };
    const EPSILON = 1e-6;
    const filtered = points.filter(([lat, lon]) =>
        !targets.some(([tLat, tLon]) => Math.abs(lat - tLat) < EPSILON && Math.abs(lon - tLon) < EPSILON)
    );
    return { points: filtered, removed: filtered.length < points.length };
}

export function detectClusteredJumps(points: [number, number][]): boolean {
    return findClusteredJumpRanges(points).length > 0;
}

/**
 * Repairs clustered-jump corruption (see findClusteredJumpRanges) by excising
 * the interleaved detour between each pair of anomalous jumps and bridging
 * directly -- e.g. a real Nancy shape's points 283 and 285 both source an
 * anomalous jump, so points 284-285 (the detour) are removed and 283 connects
 * straight to 286. Runs iteratively (fixing one cluster can occasionally
 * surface a second, e.g. two adjacent detours near the same spot) up to a
 * small iteration cap, then self-verifies: if findClusteredJumpRanges still
 * finds something afterward, the repair is rejected and the ORIGINAL points
 * are returned unchanged with repaired=false, so a shape only ever ships
 * repaired or flagged -- never a guessed fix that might still be wrong.
 * A range where start === end - 1 represents an isolated single-point reversal
 * (see findClusteredJumpRanges) -- the same splice formula removes just that
 * one point, bridging its neighbors directly.
 * Validated against all 17 real corrupted shapes found across Nancy, Bordeaux,
 * and Rennes -- every one repairs cleanly, removing only a handful of points
 * each (avg 2-9 of several hundred).
 */
export function repairClusteredJumps(points: [number, number][]): { points: [number, number][]; repaired: boolean } {
    let current = points;
    const MAX_ITERATIONS = 5;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const ranges = findClusteredJumpRanges(current);
        if (ranges.length === 0) break;
        const next = current.slice();
        for (const [start, end] of [...ranges].sort((a, b) => b[0] - a[0])) {
            next.splice(start + 1, end - start);
        }
        current = next;
    }
    const stillBad = findClusteredJumpRanges(current).length > 0;
    if (stillBad) return { points, repaired: false };
    return { points: current, repaired: true };
}

/**
 * Group raw shape point records into GtfsShape objects keyed by shape_id.
 * Also reports which shapes needed correction (duplicate-sequence de-interleaving
 * and/or implausible-jump truncation) so QA tooling can flag them (#219/#244 pattern).
 */
const groupShapes = (parsed: any[]): { shapes: GtfsShape[]; anomalies: ShapeAnomaly[] } => {
    const grouped = new Map<string, { seq: number; lat: number; lon: number }[]>();
    for (const p of parsed) {
        if (!p.shape_id) continue;
        const lat = parseFloat(p.shape_pt_lat);
        const lon = parseFloat(p.shape_pt_lon);
        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
        if (!grouped.has(p.shape_id)) grouped.set(p.shape_id, []);
        grouped.get(p.shape_id)!.push({
            seq: parseInt(p.shape_pt_sequence) || 0,
            lat,
            lon,
        });
    }
    const anomalies: ShapeAnomaly[] = [];
    const shapes = Array.from(grouped.entries()).map(([id, pts]) => {
        const hadDuplicateSequences = new Set(pts.map(p => p.seq)).size < pts.length;
        const deinterleaved = deinterleaveDuplicateSequences(pts);
        const truncated = truncateAtImplausibleJump(deinterleaved);
        const wasTruncated = truncated.length < deinterleaved.length;
        const knownFix = excludeKnownIsolatedPoints(id, truncated);
        const hasClusteredJumps = detectClusteredJumps(knownFix.points);
        let finalPoints = knownFix.points;
        let repairedClusteredJumps = false;
        if (hasClusteredJumps) {
            const repair = repairClusteredJumps(knownFix.points);
            if (repair.repaired) {
                finalPoints = repair.points;
                repairedClusteredJumps = true;
            }
        }
        if (hadDuplicateSequences || wasTruncated || hasClusteredJumps || knownFix.removed) {
            anomalies.push({
                shapeId: id,
                truncated: wasTruncated,
                deinterleaved: hadDuplicateSequences,
                clusteredJumps: hasClusteredJumps,
                repairedClusteredJumps,
                knownIsolatedPointFixed: knownFix.removed,
            });
        }
        return { id, points: finalPoints };
    });
    return { shapes, anomalies };
};

/**
 * GTFS file manifest — maps internal keys to filenames inside the ZIP.
 */
const GTFS_FILES = {
    agencies: 'agency.txt',
    routes: 'routes.txt',
    trips: 'trips.txt',
    stops: 'stops.txt',
    stopTimes: 'stop_times.txt',
    calendar: 'calendar.txt',
    calendarDates: 'calendar_dates.txt',
    shapes: 'shapes.txt',
    feedInfo: 'feed_info.txt',
    frequencies: 'frequencies.txt',
    fareAttributes: 'fare_attributes.txt',
    fareRules: 'fare_rules.txt',
    // Fares V2
    fareProducts: 'fare_products.txt',
    riderCategories: 'rider_categories.txt',
    fareLegRules: 'fare_leg_rules.txt'
} as const;

/**
 * Files that won't throw if missing.
 * calendar.txt is now optional — many agencies (including MTA) use only
 * calendar_dates.txt for exception-based scheduling.
 * agency.txt is technically required by the spec but some feeds omit it.
 */
const OPTIONAL_FILES = new Set(['feedInfo', 'shapes', 'calendar', 'calendarDates', 'agencies', 'frequencies', 'fareAttributes', 'fareRules', 'fareProducts', 'riderCategories', 'fareLegRules']);

/**
 * Synthesize GtfsCalendar entries from calendar_dates.txt when calendar.txt
 * is missing. Groups service dates by service_id and infers which days of
 * the week the service operates on by analysing the dates.
 */
export function synthesizeCalendarFromDates(calendarDates: GtfsCalendarDate[]): GtfsCalendar[] {
    // Only look at "added" entries (exception_type '1')
    const addedByService = new Map<string, string[]>();
    for (const cd of calendarDates) {
        if (cd.exception_type !== '1') continue;
        if (!addedByService.has(cd.service_id)) addedByService.set(cd.service_id, []);
        addedByService.get(cd.service_id)!.push(cd.date);
    }

    const results: GtfsCalendar[] = [];
    for (const [serviceId, dates] of addedByService.entries()) {
        // Count occurrences of each day-of-week across all service dates
        const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun=0 .. Sat=6

        let minDate = dates[0];
        let maxDate = dates[0];

        for (const dateStr of dates) {
            // GTFS dates are YYYYMMDD
            const y = parseInt(dateStr.substring(0, 4));
            const m = parseInt(dateStr.substring(4, 6)) - 1;
            const d = parseInt(dateStr.substring(6, 8));
            const date = new Date(y, m, d);
            const dow = date.getDay(); // 0=Sunday
            dayCounts[dow]++;

            if (dateStr < minDate) minDate = dateStr;
            if (dateStr > maxDate) maxDate = dateStr;
        }

        // A day is "active" if it appears in at least 20% of the weeks covered, or at least 2 times
        const totalWeeks = Math.max(1, dates.length / 7);
        const threshold = Math.max(2, totalWeeks * 0.2);

        const entry: GtfsCalendar = {
            service_id: serviceId,
            monday: dayCounts[1] >= threshold ? '1' : '0',
            tuesday: dayCounts[2] >= threshold ? '1' : '0',
            wednesday: dayCounts[3] >= threshold ? '1' : '0',
            thursday: dayCounts[4] >= threshold ? '1' : '0',
            friday: dayCounts[5] >= threshold ? '1' : '0',
            saturday: dayCounts[6] >= threshold ? '1' : '0',
            sunday: dayCounts[0] >= threshold ? '1' : '0',
            start_date: minDate,
            end_date: maxDate,
        };

        // Only add to synthesized calendar if at least one day-of-week flag is active.
        // Must check the 7 DOW fields explicitly — Object.values(entry) would also match
        // service_id='1' or other non-DOW string fields that happen to equal '1'.
        // All-zero entries must be excluded so getActiveServiceIds Step 2 can handle
        // infrequent/one-off services directly via calendar_dates lookup.
        const hasActiveDay = entry.monday === '1' || entry.tuesday === '1' ||
            entry.wednesday === '1' || entry.thursday === '1' || entry.friday === '1' ||
            entry.saturday === '1' || entry.sunday === '1';
        if (hasActiveDay) results.push(entry);
    }

    return results;
}

/**
 * Parse a GTFS ZIP file (File or ArrayBuffer) into structured GtfsData.
 *
 * Accepts an optional `onStatus` callback used by web workers to report
 * parsing progress back to the main thread.
 * 
 * Supports feeds that use `calendar.txt`, `calendar_dates.txt`, or both.
 * When only `calendar_dates.txt` is present, calendar entries are synthesized
 * by analyzing the day-of-week distribution of service dates.
 */
export const parseGtfsZip = async (
    file: File | ArrayBuffer,
    onStatus?: (message: string) => void
): Promise<GtfsData> => {
    onStatus?.('Loading ZIP archive...');
    const zip = await JSZip.loadAsync(file);

    // Auto-detect subdirectory base path — some feeds wrap GTFS files in a folder
    // (e.g. "google_transit/routes.txt", "GTFS/routes.txt"). Our parser only looks
    // at the root level by default, so we find the folder containing routes.txt first.
    let basePath = '';
    if (!zip.file('routes.txt')) {
        const routesEntry = Object.keys(zip.files).find(f =>
            f.endsWith('/routes.txt') && !zip.files[f].dir
        );
        if (routesEntry) {
            basePath = routesEntry.slice(0, routesEntry.length - 'routes.txt'.length);
            onStatus?.(`Detected subdirectory layout — base: "${basePath}"`);
        }
    }

    const gtfsData: Partial<GtfsData> = {
        agencies: [],     // Default to empty array
        shapes: [],       // Default to empty array
        calendarDates: [], // Default to empty array
        frequencies: [],   // Default to empty array
        fareAttributes: [],
        fareRules: [],
        // V2
        fareProducts: [],
        riderCategories: [],
        fareLegRules: []
    };

    for (const [key, filename] of Object.entries(GTFS_FILES)) {
        onStatus?.(`Parsing ${filename}...`);
        const zipFile = zip.file(basePath + filename);

        if (zipFile) {
            const text = await zipFile.async('text');
            const parsed = parseCsv(text);

            if (key === 'shapes') {
                const { shapes, anomalies } = groupShapes(parsed as any[]);
                gtfsData.shapes = shapes;
                if (anomalies.length > 0) gtfsData.shapeAnomalies = anomalies;
            } else {
                (gtfsData as any)[key] = parsed;
            }
        } else if (!OPTIONAL_FILES.has(key)) {
            throw new Error(`Missing required GTFS file: ${filename}`);
        }
    }

    // If calendar.txt is missing but calendar_dates.txt exists, synthesize calendar entries
    if ((!gtfsData.calendar || gtfsData.calendar.length === 0) && gtfsData.calendarDates && gtfsData.calendarDates.length > 0) {
        onStatus?.('Synthesizing calendar from calendar_dates.txt...');
        gtfsData.calendar = synthesizeCalendarFromDates(gtfsData.calendarDates);
    }

    // If both are missing (or empty after synthesis), that's a problem.
    // If calendarDates has entries even with no synthesized calendar, let it
    // through — getActiveServiceIds Step 2 handles exception-only feeds directly.
    if ((!gtfsData.calendar || gtfsData.calendar.length === 0) &&
        (!gtfsData.calendarDates || gtfsData.calendarDates.length === 0)) {
        throw new Error('GTFS feed must contain either calendar.txt or calendar_dates.txt');
    }

    // If agency.txt is missing, synthesize from feed_info or use a default
    if (!gtfsData.agencies || gtfsData.agencies.length === 0) {
        const feedInfo = gtfsData.feedInfo;
        const name = (feedInfo && Array.isArray(feedInfo) && feedInfo.length > 0 && feedInfo[0].feed_publisher_name)
            ? feedInfo[0].feed_publisher_name
            : 'Unknown Agency';
        gtfsData.agencies = [{ agency_name: name }];
    }

    // For single-agency feeds where routes don't have agency_id,
    // assign the sole agency's ID to all routes
    if (gtfsData.agencies.length === 1 && gtfsData.routes) {
        const soleAgencyId = gtfsData.agencies[0].agency_id;
        if (soleAgencyId) {
            for (const route of gtfsData.routes) {
                if (!route.agency_id) route.agency_id = soleAgencyId;
            }
        }
    }

    return gtfsData as GtfsData;
};
