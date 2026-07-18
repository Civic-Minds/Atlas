import JSZip from 'jszip';
import Papa from 'papaparse';
import { GtfsData, GtfsShape, GtfsCalendar, GtfsCalendarDate, GtfsAgency, GtfsFareAttribute, GtfsFareRule, GtfsFareProduct, GtfsRiderCategory, GtfsFareLegRule, ShapeAnomaly } from '../types/gtfs';
import { haversineDistance } from './utils.js';

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
        if (hadDuplicateSequences || wasTruncated) {
            anomalies.push({ shapeId: id, truncated: wasTruncated, deinterleaved: hadDuplicateSequences });
        }
        return { id, points: truncated };
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
