// ---------------------------------------------------------------------------
// Feed metadata — tracks each GTFS upload
// ---------------------------------------------------------------------------

export interface FeedMeta {
    feedId: string;
    agencyName: string;
    agencyId: string;              // slugified agency name, used for grouping
    fileName: string;
    feedStartDate?: string;        // earliest calendar start_date
    feedEndDate?: string;          // latest calendar end_date
    uploadedAt: number;            // Date.now()
    routeCount: number;
    committedRouteCount: number;
}

// ---------------------------------------------------------------------------
// Catalog route — one snapshot per route/direction/dayType/feed
// ---------------------------------------------------------------------------

export type VerificationStatus = 'unreviewed' | 'verified' | 'flagged' | 'skipped';

export interface CatalogRoute {
    /** Unique ID: `${agencyId}::${route}::${dir}::${dayType}::${feedId}` */
    id: string;

    /** Grouping key for history: `${agencyId}::${route}::${dir}::${dayType}` */
    routeKey: string;

    /** Direction-agnostic grouping key: `${agencyId}::${route}::${dayType}` — pairs Dir 0 and Dir 1 */
    routePairKey: string;

    feedId: string;
    agencyId: string;
    agencyName: string;

    // Route identity
    route: string;
    routeLongName?: string;
    dir: string;
    dayType: string;               // 'Weekday' | 'Saturday' | 'Sunday'
    modeName: string;
    routeType: string;

    // Frequency data
    tier: string;
    avgHeadway: number;
    medianHeadway: number;
    tripCount: number;
    reliabilityScore: number;
    peakHeadway?: number;
    baseHeadway?: number;
    serviceSpan?: { start: number; end: number };

    // Shape geometry — lat/lon polyline for map rendering
    shape: [number, number][];

    // Verification
    verificationStatus: VerificationStatus;
    verifiedAt?: number;
    verificationNotes?: string;

    // Metadata
    committedAt: number;
    daysIncluded?: string[];
}

// ---------------------------------------------------------------------------
// Change detection result
// ---------------------------------------------------------------------------

export interface ChangeDetectionResult {
    added: CatalogRoute[];         // new routes not in previous catalog
    updated: CatalogRoute[];       // routes whose frequency data changed
    unchanged: CatalogRoute[];     // routes with same data (inherit verification)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slugify an agency name into a stable ID */
export function slugifyAgency(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

/** Build the unique catalog route ID */
export function catalogRouteId(agencyId: string, route: string, dir: string, dayType: string, feedId: string): string {
    return `${agencyId}::${route}::${dir}::${dayType}::${feedId}`;
}

/** Build the grouping key for history (without feedId) */
export function catalogRouteKey(agencyId: string, route: string, dir: string, dayType: string): string {
    return `${agencyId}::${route}::${dir}::${dayType}`;
}

/** Build the direction-agnostic pairing key (groups both directions together) */
export function catalogRoutePairKey(agencyId: string, route: string, dayType: string): string {
    return `${agencyId}::${route}::${dayType}`;
}
