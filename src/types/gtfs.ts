export interface GtfsRoute {
    route_id: string;
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

export interface GtfsData {
    routes: GtfsRoute[];
    trips: GtfsTrip[];
    stops: GtfsStop[];
    stopTimes: GtfsStopTime[];
    calendar: GtfsCalendar[];
    calendarDates: GtfsCalendarDate[];
    shapes: GtfsShape[];
    feedInfo?: any;
}

export interface AnalysisResult {
    route: string;
    day: string;
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
    routeType?: string;  // GTFS route_type (0=tram, 1=subway, 2=rail, 3=bus, etc.)
    modeName?: string;   // Human-readable mode label
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
