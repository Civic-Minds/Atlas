import { GtfsData, AnalysisResult } from '../types/gtfs';
import {
    FeedMeta,
    CatalogRoute,
    ChangeDetectionResult,
    slugifyAgency,
    catalogRouteId,
    catalogRouteKey,
    catalogRoutePairKey,
} from '../types/catalog';

// ---------------------------------------------------------------------------
// Feed metadata extraction
// ---------------------------------------------------------------------------

/**
 * Extract feed metadata from parsed GTFS data.
 * Uses agency.txt if available, then feed_info.txt, falls back to filename.
 */
export function extractFeedMeta(gtfsData: GtfsData, fileName: string): Omit<FeedMeta, 'committedRouteCount'> {
    const feedId = crypto.randomUUID();

    // Determine agency name: agency.txt (single) → feed_info → filename
    let agencyName = fileName.replace(/\.zip$/i, '');
    if (gtfsData.agencies && gtfsData.agencies.length === 1) {
        agencyName = gtfsData.agencies[0].agency_name;
    } else {
        const feedInfo = gtfsData.feedInfo;
        if (feedInfo && Array.isArray(feedInfo) && feedInfo.length > 0) {
            const info = feedInfo[0];
            if (info.feed_publisher_name) {
                agencyName = info.feed_publisher_name;
            }
        }
    }

    // Get date range from calendar
    let feedStartDate: string | undefined;
    let feedEndDate: string | undefined;
    if (gtfsData.calendar && gtfsData.calendar.length > 0) {
        const starts = gtfsData.calendar.map(c => c.start_date).filter(Boolean).sort();
        const ends = gtfsData.calendar.map(c => c.end_date).filter(Boolean).sort();
        if (starts.length > 0) feedStartDate = starts[0];
        if (ends.length > 0) feedEndDate = ends[ends.length - 1];
    }

    return {
        feedId,
        agencyName,
        agencyId: slugifyAgency(agencyName),
        fileName,
        feedStartDate,
        feedEndDate,
        uploadedAt: Date.now(),
        routeCount: gtfsData.routes?.length || 0,
    };
}

// ---------------------------------------------------------------------------
// Shape resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the best shape for a route+direction combination.
 * Picks the most common shape_id among matching trips.
 * Falls back to stop-sequence polyline if no shapes available.
 */
export function resolveRouteShape(
    gtfsData: GtfsData,
    routeId: string,
    dirId: string
): [number, number][] {
    const matchingTrips = gtfsData.trips.filter(
        t => t.route_id === routeId && (t.direction_id || '0') === dirId
    );

    if (matchingTrips.length === 0) return [];

    // Count shape_id frequency to find the most representative shape
    if (gtfsData.shapes && gtfsData.shapes.length > 0) {
        const shapeCounts = new Map<string, number>();
        for (const trip of matchingTrips) {
            if (trip.shape_id) {
                shapeCounts.set(trip.shape_id, (shapeCounts.get(trip.shape_id) || 0) + 1);
            }
        }

        if (shapeCounts.size > 0) {
            // Pick most common shape_id
            let bestShapeId = '';
            let bestCount = 0;
            for (const [shapeId, count] of shapeCounts) {
                if (count > bestCount) {
                    bestShapeId = shapeId;
                    bestCount = count;
                }
            }

            const shape = gtfsData.shapes.find(s => s.id === bestShapeId);
            if (shape && shape.points.length > 0) {
                return shape.points;
            }
        }
    }

    // Fallback: build polyline from stop sequence of first trip
    const firstTrip = matchingTrips[0];
    const stopTimes = gtfsData.stopTimes
        .filter(st => st.trip_id === firstTrip.trip_id)
        .sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));

    const points: [number, number][] = [];
    for (const st of stopTimes) {
        const stop = gtfsData.stops.find(s => s.stop_id === st.stop_id);
        if (stop) {
            points.push([parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)]);
        }
    }

    return points;
}

// ---------------------------------------------------------------------------
// Build catalog routes from analysis results
// ---------------------------------------------------------------------------

/**
 * Convert analysis results + GTFS data into CatalogRoute entries.
 * Resolves shapes and attaches feed metadata.
 * For multi-agency feeds, uses per-route agency_id from routes.txt.
 */
export function buildCatalogRoutes(
    gtfsData: GtfsData,
    analysisResults: AnalysisResult[],
    feedMeta: Pick<FeedMeta, 'feedId' | 'agencyId' | 'agencyName'>
): CatalogRoute[] {
    const { feedId } = feedMeta;

    // Build agency lookup: agency_id → agency_name
    const agencyMap = new Map<string, string>();
    if (gtfsData.agencies) {
        for (const a of gtfsData.agencies) {
            if (a.agency_id) agencyMap.set(a.agency_id, a.agency_name);
        }
    }

    // Cache resolved shapes by route+dir to avoid redundant lookups
    const shapeCache = new Map<string, [number, number][]>();

    return analysisResults.map(result => {
        const shapeKey = `${result.route}::${result.dir}`;
        if (!shapeCache.has(shapeKey)) {
            const gtfsRoute = gtfsData.routes.find(
                r => r.route_short_name === result.route || r.route_id === result.route
            );
            const routeId = gtfsRoute?.route_id || result.route;
            shapeCache.set(shapeKey, resolveRouteShape(gtfsData, routeId, result.dir));
        }

        const gtfsRoute = gtfsData.routes.find(
            r => r.route_short_name === result.route || r.route_id === result.route
        );

        // Resolve per-route agency: use route's agency_id → lookup name, fallback to feed-level
        const routeAgencyId = gtfsRoute?.agency_id
            ? slugifyAgency(agencyMap.get(gtfsRoute.agency_id) || gtfsRoute.agency_id)
            : feedMeta.agencyId;
        const routeAgencyName = gtfsRoute?.agency_id
            ? (agencyMap.get(gtfsRoute.agency_id) || feedMeta.agencyName)
            : feedMeta.agencyName;

        const routeKey = catalogRouteKey(routeAgencyId, result.route, result.dir, result.day);
        const routePairKey = catalogRoutePairKey(routeAgencyId, result.route, result.day);
        const id = catalogRouteId(routeAgencyId, result.route, result.dir, result.day, feedId);

        return {
            id,
            routeKey,
            routePairKey,
            feedId,
            agencyId: routeAgencyId,
            agencyName: routeAgencyName,
            route: result.route,
            routeLongName: gtfsRoute?.route_long_name,
            dir: result.dir,
            dayType: result.day,
            modeName: result.modeName || 'Transit',
            routeType: result.routeType || '3',
            tier: result.tier,
            avgHeadway: result.avgHeadway,
            medianHeadway: result.medianHeadway,
            tripCount: result.tripCount,
            reliabilityScore: result.reliabilityScore,
            peakHeadway: result.peakHeadway,
            baseHeadway: result.baseHeadway,
            serviceSpan: result.serviceSpan,
            shape: shapeCache.get(shapeKey) || [],
            verificationStatus: 'unreviewed' as const,
            committedAt: Date.now(),
            daysIncluded: result.daysIncluded,
        };
    });
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/**
 * Compare incoming catalog routes against existing ones.
 * Groups by routeKey to find added, updated, and unchanged routes.
 *
 * "Unchanged" = same tier AND avgHeadway within ±2 min AND same tripCount (±10%).
 * Unchanged routes inherit verification status from the most recent existing snapshot.
 */
export function detectChanges(
    existingRoutes: CatalogRoute[],
    incomingRoutes: CatalogRoute[]
): ChangeDetectionResult {
    // Build a map of routeKey → most recent existing entry
    const latestByKey = new Map<string, CatalogRoute>();
    for (const route of existingRoutes) {
        const existing = latestByKey.get(route.routeKey);
        if (!existing || route.committedAt > existing.committedAt) {
            latestByKey.set(route.routeKey, route);
        }
    }

    const added: CatalogRoute[] = [];
    const updated: CatalogRoute[] = [];
    const unchanged: CatalogRoute[] = [];

    for (const incoming of incomingRoutes) {
        const prev = latestByKey.get(incoming.routeKey);

        if (!prev) {
            added.push(incoming);
            continue;
        }

        const sameTier = prev.tier === incoming.tier;
        const sameHeadway = Math.abs(prev.avgHeadway - incoming.avgHeadway) <= 2;
        const tripRatio = prev.tripCount > 0 ? incoming.tripCount / prev.tripCount : 1;
        const sameTrips = tripRatio >= 0.9 && tripRatio <= 1.1;

        if (sameTier && sameHeadway && sameTrips) {
            // Inherit verification status from previous version
            incoming.verificationStatus = prev.verificationStatus;
            incoming.verifiedAt = prev.verifiedAt;
            incoming.verificationNotes = prev.verificationNotes;
            unchanged.push(incoming);
        } else {
            // Data changed — reset to unreviewed
            incoming.verificationStatus = 'unreviewed';
            updated.push(incoming);
        }
    }

    return { added, updated, unchanged };
}

/**
 * Derive the "current" routes from a full catalog (all historical snapshots).
 * Returns the latest snapshot per routeKey.
 */
export function deriveCurrentRoutes(allRoutes: CatalogRoute[]): CatalogRoute[] {
    const latestByKey = new Map<string, CatalogRoute>();
    for (const route of allRoutes) {
        const existing = latestByKey.get(route.routeKey);
        if (!existing || route.committedAt > existing.committedAt) {
            latestByKey.set(route.routeKey, route);
        }
    }
    return Array.from(latestByKey.values());
}
