/**
 * GTFS Spec Validation Engine
 * 
 * Validates a GTFS feed against the official GTFS Schedule Reference spec.
 * Runs as a pre-analysis check to surface data quality issues before
 * they corrupt downstream analysis.
 * 
 * Reference: https://gtfs.org/schedule/reference/
 */

import { GtfsData } from '../types/gtfs';

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
    severity: ValidationSeverity;
    code: string;
    file: string;
    field?: string;
    message: string;
    count?: number;      // How many records are affected
    examples?: string[]; // Sample IDs for debugging
}

export interface ValidationReport {
    feedName: string;
    timestamp: string;
    totalIssues: number;
    errors: number;
    warnings: number;
    infos: number;
    issues: ValidationIssue[];
    summary: {
        routes: number;
        trips: number;
        stops: number;
        stopTimes: number;
        calendarEntries: number;
        calendarDates: number;
        shapes: number;
    };
}

// --- Required fields per GTFS spec ---

const REQUIRED_ROUTE_FIELDS = ['route_id', 'route_type'] as const;
const REQUIRED_TRIP_FIELDS = ['route_id', 'service_id', 'trip_id'] as const;
const REQUIRED_STOP_FIELDS = ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'] as const;
const REQUIRED_STOP_TIME_FIELDS = ['trip_id', 'stop_id', 'stop_sequence'] as const;
const REQUIRED_CALENDAR_FIELDS = [
    'service_id', 'monday', 'tuesday', 'wednesday', 'thursday',
    'friday', 'saturday', 'sunday', 'start_date', 'end_date'
] as const;

// Valid GTFS route_type values
const VALID_ROUTE_TYPES = new Set([
    '0', '1', '2', '3', '4', '5', '6', '7', '11', '12',
    // Extended GTFS types (100-series)
    ...Array.from({ length: 20 }, (_, i) => String(100 + i)),
    ...Array.from({ length: 20 }, (_, i) => String(200 + i)),
    ...Array.from({ length: 20 }, (_, i) => String(400 + i)),
    ...Array.from({ length: 20 }, (_, i) => String(700 + i)),
    ...Array.from({ length: 20 }, (_, i) => String(900 + i)),
    '1000', '1100', '1200', '1300', '1400', '1500', '1600', '1700',
]);

/**
 * Validate a parsed GTFS dataset and return a structured report.
 */
export function validateGtfs(gtfs: GtfsData, feedName: string = 'Uploaded Feed'): ValidationReport {
    const issues: ValidationIssue[] = [];

    // --- File presence checks ---
    if (!gtfs.routes || gtfs.routes.length === 0) {
        issues.push({
            severity: 'error', code: 'E001', file: 'routes.txt',
            message: 'Required file routes.txt is missing or empty.',
        });
    }
    if (!gtfs.trips || gtfs.trips.length === 0) {
        issues.push({
            severity: 'error', code: 'E002', file: 'trips.txt',
            message: 'Required file trips.txt is missing or empty.',
        });
    }
    if (!gtfs.stops || gtfs.stops.length === 0) {
        issues.push({
            severity: 'error', code: 'E003', file: 'stops.txt',
            message: 'Required file stops.txt is missing or empty.',
        });
    }
    if (!gtfs.stopTimes || gtfs.stopTimes.length === 0) {
        issues.push({
            severity: 'error', code: 'E004', file: 'stop_times.txt',
            message: 'Required file stop_times.txt is missing or empty.',
        });
    }
    if ((!gtfs.calendar || gtfs.calendar.length === 0) && (!gtfs.calendarDates || gtfs.calendarDates.length === 0)) {
        issues.push({
            severity: 'error', code: 'E005', file: 'calendar.txt / calendar_dates.txt',
            message: 'Feed must contain at least one of calendar.txt or calendar_dates.txt.',
        });
    }
    if (!gtfs.shapes || gtfs.shapes.length === 0) {
        issues.push({
            severity: 'warning', code: 'W001', file: 'shapes.txt',
            message: 'shapes.txt is missing — route geometries will fall back to stop-to-stop straight lines.',
        });
    }

    // --- Required field checks ---
    if (gtfs.routes?.length) {
        validateRequiredFields(gtfs.routes, REQUIRED_ROUTE_FIELDS, 'routes.txt', 'route_id', issues);
    }
    if (gtfs.trips?.length) {
        validateRequiredFields(gtfs.trips, REQUIRED_TRIP_FIELDS, 'trips.txt', 'trip_id', issues);
    }
    if (gtfs.stops?.length) {
        validateRequiredFields(gtfs.stops, REQUIRED_STOP_FIELDS, 'stops.txt', 'stop_id', issues);
    }
    if (gtfs.stopTimes?.length) {
        validateRequiredFields(gtfs.stopTimes, REQUIRED_STOP_TIME_FIELDS, 'stop_times.txt', 'trip_id', issues);
    }
    if (gtfs.calendar?.length) {
        validateRequiredFields(gtfs.calendar, REQUIRED_CALENDAR_FIELDS, 'calendar.txt', 'service_id', issues);
    }

    // --- Referential integrity checks ---
    if (gtfs.routes?.length && gtfs.trips?.length) {
        const routeIds = new Set(gtfs.routes.map(r => r.route_id));
        const orphanedTrips = gtfs.trips.filter(t => !routeIds.has(t.route_id));
        if (orphanedTrips.length > 0) {
            issues.push({
                severity: 'error', code: 'E010', file: 'trips.txt', field: 'route_id',
                message: `${orphanedTrips.length} trips reference route_ids that don't exist in routes.txt.`,
                count: orphanedTrips.length,
                examples: orphanedTrips.slice(0, 5).map(t => t.trip_id),
            });
        }
    }

    if (gtfs.trips?.length && gtfs.calendar?.length) {
        const serviceIds = new Set(gtfs.calendar.map(c => c.service_id));
        // Also include calendar_dates service_ids
        if (gtfs.calendarDates?.length) {
            for (const cd of gtfs.calendarDates) {
                serviceIds.add(cd.service_id);
            }
        }
        const orphanedTrips = gtfs.trips.filter(t => !serviceIds.has(t.service_id));
        if (orphanedTrips.length > 0) {
            issues.push({
                severity: 'warning', code: 'W010', file: 'trips.txt', field: 'service_id',
                message: `${orphanedTrips.length} trips reference service_ids not found in calendar.txt or calendar_dates.txt.`,
                count: orphanedTrips.length,
                examples: orphanedTrips.slice(0, 5).map(t => `${t.trip_id} (service: ${t.service_id})`),
            });
        }
    }

    if (gtfs.stopTimes?.length && gtfs.trips?.length) {
        const tripIds = new Set(gtfs.trips.map(t => t.trip_id));
        const orphanedStopTimes = gtfs.stopTimes.filter(st => !tripIds.has(st.trip_id));
        if (orphanedStopTimes.length > 0) {
            issues.push({
                severity: 'warning', code: 'W011', file: 'stop_times.txt', field: 'trip_id',
                message: `${orphanedStopTimes.length} stop_times reference trip_ids not found in trips.txt.`,
                count: orphanedStopTimes.length,
                examples: [...new Set(orphanedStopTimes.slice(0, 5).map(st => st.trip_id))],
            });
        }
    }

    if (gtfs.stopTimes?.length && gtfs.stops?.length) {
        const stopIds = new Set(gtfs.stops.map(s => s.stop_id));
        const orphanedStopTimes = gtfs.stopTimes.filter(st => !stopIds.has(st.stop_id));
        if (orphanedStopTimes.length > 0) {
            issues.push({
                severity: 'warning', code: 'W012', file: 'stop_times.txt', field: 'stop_id',
                message: `${orphanedStopTimes.length} stop_times reference stop_ids not found in stops.txt.`,
                count: orphanedStopTimes.length,
                examples: [...new Set(orphanedStopTimes.slice(0, 5).map(st => st.stop_id))],
            });
        }
    }

    // --- Data quality checks ---

    // Invalid coordinates
    if (gtfs.stops?.length) {
        const badCoords = gtfs.stops.filter(s => {
            const lat = parseFloat(s.stop_lat);
            const lon = parseFloat(s.stop_lon);
            return isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180;
        });
        if (badCoords.length > 0) {
            issues.push({
                severity: 'error', code: 'E020', file: 'stops.txt', field: 'stop_lat/stop_lon',
                message: `${badCoords.length} stops have invalid or out-of-range coordinates.`,
                count: badCoords.length,
                examples: badCoords.slice(0, 5).map(s => `${s.stop_id} (${s.stop_lat}, ${s.stop_lon})`),
            });
        }

        // Stops at (0, 0) — common data error
        const nullIsland = gtfs.stops.filter(s =>
            parseFloat(s.stop_lat) === 0 && parseFloat(s.stop_lon) === 0
        );
        if (nullIsland.length > 0) {
            issues.push({
                severity: 'warning', code: 'W020', file: 'stops.txt', field: 'stop_lat/stop_lon',
                message: `${nullIsland.length} stops are located at (0, 0) — "Null Island". Likely a data error.`,
                count: nullIsland.length,
                examples: nullIsland.slice(0, 5).map(s => s.stop_id),
            });
        }
    }

    // Invalid route_type values
    if (gtfs.routes?.length) {
        const invalidTypes = gtfs.routes.filter(r => !VALID_ROUTE_TYPES.has(r.route_type));
        if (invalidTypes.length > 0) {
            issues.push({
                severity: 'warning', code: 'W021', file: 'routes.txt', field: 'route_type',
                message: `${invalidTypes.length} routes have non-standard route_type values.`,
                count: invalidTypes.length,
                examples: invalidTypes.slice(0, 5).map(r => `${r.route_id} (type: ${r.route_type})`),
            });
        }
    }

    // Duplicate IDs
    if (gtfs.routes?.length) {
        const dupes = findDuplicates(gtfs.routes.map(r => r.route_id));
        if (dupes.length > 0) {
            issues.push({
                severity: 'error', code: 'E030', file: 'routes.txt', field: 'route_id',
                message: `${dupes.length} duplicate route_id values found.`,
                count: dupes.length,
                examples: dupes.slice(0, 5),
            });
        }
    }

    if (gtfs.stops?.length) {
        const dupes = findDuplicates(gtfs.stops.map(s => s.stop_id));
        if (dupes.length > 0) {
            issues.push({
                severity: 'error', code: 'E031', file: 'stops.txt', field: 'stop_id',
                message: `${dupes.length} duplicate stop_id values found.`,
                count: dupes.length,
                examples: dupes.slice(0, 5),
            });
        }
    }

    // Missing departure/arrival times in stop_times
    if (gtfs.stopTimes?.length) {
        const missingTimes = gtfs.stopTimes.filter(st =>
            (!st.departure_time || st.departure_time.trim() === '') &&
            (!st.arrival_time || st.arrival_time.trim() === '')
        );
        if (missingTimes.length > 0) {
            issues.push({
                severity: 'warning', code: 'W030', file: 'stop_times.txt', field: 'departure_time/arrival_time',
                message: `${missingTimes.length} stop_times are missing both departure and arrival times.`,
                count: missingTimes.length,
                examples: missingTimes.slice(0, 5).map(st => `trip ${st.trip_id}, seq ${st.stop_sequence}`),
            });
        }
    }

    // Trips with no stop_times
    if (gtfs.trips?.length && gtfs.stopTimes?.length) {
        const tripsWithStops = new Set(gtfs.stopTimes.map(st => st.trip_id));
        const emptyTrips = gtfs.trips.filter(t => !tripsWithStops.has(t.trip_id));
        if (emptyTrips.length > 0) {
            issues.push({
                severity: 'warning', code: 'W031', file: 'trips.txt',
                message: `${emptyTrips.length} trips have no entries in stop_times.txt and will be excluded from analysis.`,
                count: emptyTrips.length,
                examples: emptyTrips.slice(0, 5).map(t => t.trip_id),
            });
        }
    }

    // Routes with no trips
    if (gtfs.routes?.length && gtfs.trips?.length) {
        const routesWithTrips = new Set(gtfs.trips.map(t => t.route_id));
        const emptyRoutes = gtfs.routes.filter(r => !routesWithTrips.has(r.route_id));
        if (emptyRoutes.length > 0) {
            issues.push({
                severity: 'info', code: 'I001', file: 'routes.txt',
                message: `${emptyRoutes.length} routes have no trips defined and will appear empty in analysis.`,
                count: emptyRoutes.length,
                examples: emptyRoutes.slice(0, 5).map(r => `${r.route_id} (${r.route_short_name || r.route_long_name || 'unnamed'})`),
            });
        }
    }

    // --- Summary ---
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    const infos = issues.filter(i => i.severity === 'info').length;

    return {
        feedName,
        timestamp: new Date().toISOString(),
        totalIssues: issues.length,
        errors,
        warnings,
        infos,
        issues,
        summary: {
            routes: gtfs.routes?.length || 0,
            trips: gtfs.trips?.length || 0,
            stops: gtfs.stops?.length || 0,
            stopTimes: gtfs.stopTimes?.length || 0,
            calendarEntries: gtfs.calendar?.length || 0,
            calendarDates: gtfs.calendarDates?.length || 0,
            shapes: gtfs.shapes?.length || 0,
        },
    };
}

// --- Helpers ---

function validateRequiredFields<T extends Record<string, any>>(
    records: T[],
    requiredFields: readonly string[],
    filename: string,
    idField: string,
    issues: ValidationIssue[]
): void {
    for (const field of requiredFields) {
        const missing = records.filter(r =>
            r[field] === undefined || r[field] === null || String(r[field]).trim() === ''
        );
        if (missing.length > 0) {
            issues.push({
                severity: 'error',
                code: `E00F`,
                file: filename,
                field,
                message: `${missing.length} records in ${filename} are missing required field "${field}".`,
                count: missing.length,
                examples: missing.slice(0, 5).map(r => String(r[idField] || 'unknown')),
            });
        }
    }
}

function findDuplicates(ids: string[]): string[] {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of ids) {
        if (seen.has(id)) dupes.add(id);
        seen.add(id);
    }
    return [...dupes];
}
