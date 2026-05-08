"use strict";
/**
 * Atlas NextGen ingestion poller.
 *
 * For each configured agency, polls the GTFS-RT vehicle positions feed
 * on a fixed interval and writes every observed position to Postgres.
 * This builds the historical record that OTP analysis runs against.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPolling = startPolling;
const db_1 = require("../storage/db");
const position_queue_1 = require("../queues/position-queue");
const config_1 = require("../config");
const logger_1 = require("../logger");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
async function fetchPositions(agency) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
        res = await fetch(agency.vehiclePositionsUrl, { headers: agency.headers ?? {}, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
    if (!res.ok)
        throw new Error(`HTTP ${res.status} from ${agency.vehiclePositionsUrl}`);
    const buf = await res.arrayBuffer();
    const RT = GtfsRealtimeBindings.transit_realtime;
    const feed = RT.FeedMessage.decode(new Uint8Array(buf));
    const positions = [];
    const observedAt = new Date();
    const allowedRoutes = config_1.ROUTE_FILTER[agency.id] ?? null;
    for (const entity of feed.entity) {
        const v = entity.vehicle;
        if (!v?.position)
            continue;
        const routeId = v.trip?.routeId ?? '';
        if (allowedRoutes && !allowedRoutes.includes(routeId))
            continue;
        positions.push({
            agencyId: agency.id,
            vehicleId: v.vehicle?.id ?? entity.id,
            tripId: v.trip?.tripId ?? '',
            routeId: v.trip?.routeId ?? '',
            lat: v.position.latitude,
            lon: v.position.longitude,
            speed: v.position.speed ?? null,
            bearing: v.position.bearing ?? null,
            stopId: v.stopId ?? null,
            stopSequence: v.currentStopSequence ?? null,
            currentStatus: v.currentStatus ?? null,
            delaySeconds: null,
            matchConfidence: null,
            observedAt,
        });
    }
    return positions;
}
async function pollAgency(agency) {
    try {
        const rawPositions = await fetchPositions(agency);
        // Asynchronous Hand-off: Just push to Redis queue
        await (0, position_queue_1.pushToProcessingQueue)(agency, rawPositions);
        logger_1.log.info('Poll', 'queued', { agency: agency.id, vehicles: rawPositions.length });
    }
    catch (err) {
        const msg = err.message;
        await (0, db_1.logIngestion)(agency.id, false, undefined, msg).catch(() => undefined);
        logger_1.log.error('Poll', 'failed', { agency: agency.id, err: msg });
    }
}
function startPolling(agencies, defaultIntervalMs) {
    logger_1.log.info('Poller', 'starting', {
        agencies: agencies.map(a => a.id),
        defaultIntervalMs,
    });
    // Start each agency's poller with a staggered delay to prevent bursts.
    // 511.org agencies (muni, actransit, vta) share one rate-limited API key,
    // so add up to 30s of random jitter to spread their startup polls.
    agencies.forEach((agency, index) => {
        const interval = agency.pollingIntervalMs ?? defaultIntervalMs;
        const is511Agency = agency.vehiclePositionsUrl.includes('api.511.org');
        const jitterMs = is511Agency ? Math.floor(Math.random() * 30000) : 0;
        const staggeredStartDelay = index * 500 + jitterMs; // 500ms base stagger + optional jitter
        setTimeout(() => {
            // First immediate poll
            void pollAgency(agency);
            // Subsequent recurring polls
            setInterval(() => void pollAgency(agency), interval);
            logger_1.log.info('Poller', 'initialized', { agency: agency.id, intervalMs: interval, delayedStartMs: staggeredStartDelay, ...(agency.limit ? { rateLimit: agency.limit.notes } : {}) });
        }, staggeredStartDelay);
    });
}
