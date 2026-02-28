import JSZip from 'jszip';
import Papa from 'papaparse';
import { GtfsData, GtfsShape, GtfsCalendar, GtfsCalendarDate, GtfsAgency } from '../types/gtfs';

/**
 * Parse a CSV string into an array of typed objects.
 */
export const parseCsv = <T>(text: string): T[] => {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
    });
    return result.data as T[];
};

/**
 * Group raw shape point records into GtfsShape objects keyed by shape_id.
 */
const groupShapes = (parsed: any[]): GtfsShape[] => {
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
    return Array.from(grouped.entries()).map(([id, pts]) => ({
        id,
        points: pts
            .sort((a, b) => a.seq - b.seq)
            .map(p => [p.lat, p.lon] as [number, number]),
    }));
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
    frequencies: 'frequencies.txt'
} as const;

/**
 * Files that won't throw if missing.
 * calendar.txt is now optional — many agencies (including MTA) use only
 * calendar_dates.txt for exception-based scheduling.
 * agency.txt is technically required by the spec but some feeds omit it.
 */
const OPTIONAL_FILES = new Set(['feedInfo', 'shapes', 'calendar', 'calendarDates', 'agencies', 'frequencies']);

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

        results.push({
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
        });
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

    const gtfsData: Partial<GtfsData> = {
        agencies: [],     // Default to empty array
        shapes: [],       // Default to empty array
        calendarDates: [], // Default to empty array
        frequencies: []   // Default to empty array
    };

    for (const [key, filename] of Object.entries(GTFS_FILES)) {
        onStatus?.(`Parsing ${filename}...`);
        const zipFile = zip.file(filename);

        if (zipFile) {
            const text = await zipFile.async('text');
            const parsed = parseCsv(text);

            if (key === 'shapes') {
                gtfsData.shapes = groupShapes(parsed as any[]);
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

    // If both are missing, that's a problem
    if (!gtfsData.calendar || gtfsData.calendar.length === 0) {
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
