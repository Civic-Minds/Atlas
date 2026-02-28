export interface GtfsAgency {
    agency_id?: string;
    agency_name: string;
    agency_url?: string;
    agency_timezone?: string;
}

export interface GtfsRoute {
    route_id: string;
    agency_id?: string;
    route_short_name?: string;
    route_long_name?: string;
    route_type: string;
    route_color?: string;
    route_text_color?: string;
}

export interface GtfsTrip {
    route_id: string;
    service_id: string;
    trip_id: string;
    trip_headsign?: string;
    direction_id?: string;
    block_id?: string;
    shape_id?: string;
}

export interface GtfsStop {
    stop_id: string;
    stop_code?: string;
    stop_name: string;
    stop_lat: string;
    stop_lon: string;
    zone_id?: string;
    stop_url?: string;
    location_type?: string;
    parent_station?: string;
}

export interface GtfsStopTime {
    trip_id: string;
    arrival_time: string;
    departure_time: string;
    stop_id: string;
    stop_sequence: string;
    stop_headsign?: string;
    pickup_type?: string;
    drop_off_type?: string;
    shape_dist_traveled?: string;
}

export interface GtfsCalendar {
    service_id: string;
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
    sunday: string;
    start_date: string;
    end_date: string;
}

export interface GtfsCalendarDate {
    service_id: string;
    date: string; // YYYYMMDD format
    exception_type: string; // '1' = added, '2' = removed
}

export interface GtfsShapePoint {
    shape_id: string;
    shape_pt_lat: string;
    shape_pt_lon: string;
    shape_pt_sequence: string;
    shape_dist_traveled?: string;
}

export interface GtfsShape {
    id: string;
    points: [number, number][];
}

export interface GtfsFrequency {
    trip_id: string;
    start_time: string;  // HH:MM:SS
    end_time: string;    // HH:MM:SS
    headway_secs: string;
    exact_times?: string; // '0' (default) or '1'
}

export interface GtfsFeedInfo {
    feed_publisher_name?: string;
    feed_publisher_url?: string;
    feed_lang?: string;
    feed_start_date?: string;
    feed_end_date?: string;
    feed_version?: string;
    feed_contact_email?: string;
    feed_contact_url?: string;
}

export interface GtfsData {
    agencies: GtfsAgency[];
    routes: GtfsRoute[];
    trips: GtfsTrip[];
    stops: GtfsStop[];
    stopTimes: GtfsStopTime[];
    calendar: GtfsCalendar[];
    calendarDates: GtfsCalendarDate[];
    shapes: GtfsShape[];
    feedInfo?: GtfsFeedInfo[];
    frequencies?: GtfsFrequency[];
}

// ---------------------------------------------------------------------------
// Individual day names for per-day analysis
// ---------------------------------------------------------------------------

export type DayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
export type DayType = 'Weekday' | 'Saturday' | 'Sunday';

export const ALL_DAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS: DayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const DAY_TO_TYPE: Record<DayName, DayType> = {
    Monday: 'Weekday', Tuesday: 'Weekday', Wednesday: 'Weekday',
    Thursday: 'Weekday', Friday: 'Weekday', Saturday: 'Saturday', Sunday: 'Sunday',
};

// ---------------------------------------------------------------------------
// Raw departure data — computed once per GTFS feed, per route/dir/day
// ---------------------------------------------------------------------------

export interface RawRouteDepartures {
    route: string;
    dir: string;
    day: DayName;
    routeType: string;
    modeName: string;

    /** Every departure time in minutes from midnight, sorted ascending, deduplicated */
    departureTimes: number[];

    /** Every gap between consecutive departures — NO filtering, all gaps kept */
    gaps: number[];

    /** First to last departure */
    serviceSpan: { start: number; end: number };

    /** Number of deduplicated departures */
    tripCount: number;

    /** Which service_ids contributed trips to this group */
    serviceIds: string[];

    /** Warnings (e.g., "Multiple service_ids overlap on this day") */
    warnings: string[];
}

// ---------------------------------------------------------------------------
// User-configurable analysis criteria
// ---------------------------------------------------------------------------

export interface TimeWindow {
    start: number;  // minutes from midnight, e.g. 420 = 7:00 AM
    end: number;    // minutes from midnight, e.g. 1320 = 10:00 PM
}

export interface DayTypeCriteria {
    timeWindow: TimeWindow;
    tiers: number[];  // e.g. [10, 15, 20, 30, 60]
}

export interface AnalysisCriteria {
    id: string;
    name: string;
    dayTypes: Partial<Record<DayType, DayTypeCriteria>>;
    graceMinutes: number;         // default: 5
    maxGraceViolations: number;   // default: 2
    /** Override tiers for rail vs surface modes */
    modeTierOverrides?: Record<string, number[]>;
    isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Analysis result — output of applying criteria to raw data
// ---------------------------------------------------------------------------

export interface AnalysisResult {
    route: string;
    day: string;              // DayType ('Weekday' | 'Saturday' | 'Sunday') for rolled-up view
    dir: string;
    avgHeadway: number;
    medianHeadway: number;
    tier: string;
    tripCount: number;
    gaps: number[];
    times: number[];
    reliabilityScore: number;
    headwayVariance: number;
    bunchingFactor: number;
    peakHeadway?: number;
    baseHeadway?: number;
    peakWindow?: { start: number; end: number };
    serviceSpan?: { start: number; end: number };
    routeType?: string;
    modeName?: string;
    /** Which service_ids contributed to this result */
    serviceIds?: string[];
    /** Warnings from raw data extraction */
    warnings?: string[];
    /** Which individual days this rolled-up result covers */
    daysIncluded?: DayName[];
}

export interface CorridorResult {
    linkId: string;
    stopA: string;
    stopB: string;
    routeIds: string[];
    tripCount: number;
    avgHeadway: number;
    peakHeadway: number;
    reliabilityScore: number;
}

export interface SpacingResult {
    route: string;
    direction: string;
    avgSpacing: number;
    medianSpacing: number;
    totalStops: number;
    redundantPairs: Array<{
        stopA: string;
        stopAName: string;
        stopB: string;
        stopBName: string;
        distance: number;
    }>;
}
