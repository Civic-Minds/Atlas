"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPositionWorker = startPositionWorker;
const bullmq_1 = require("bullmq");
const db_1 = require("../storage/db");
const matcher_1 = require("../intelligence/matcher");
const notion_sync_1 = require("../intelligence/notion-sync");
const logger_1 = require("../logger");
// Throttle Notion syncs to once every 15 minutes per agency to avoid rate limits
const lastNotionSync = {};
const NOTION_SYNC_THROTTLE_MS = 15 * 60 * 1000;
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
/**
 * Background worker to consume matching and insertion jobs from Redis.
 * This prevents blocking the main 30-second poller.
 */
function startPositionWorker() {
    const worker = new bullmq_1.Worker('position-processing', async (job) => {
        const { agency, positions: rawPositions } = job.data;
        logger_1.log.info('Queue', 'starting job', { agency: agency.id, jobId: job.id });
        try {
            // Perform the heavy spatial math (schedule matching) in the background
            const { matchedPositions, segmentMetrics, stopDwellMetrics, diagnostics } = await (0, matcher_1.matchPositions)(agency, rawPositions);
            logger_1.log.info('Queue', 'matching finished', {
                agency: agency.id,
                count: matchedPositions.length,
                segments: segmentMetrics.length,
                dwells: stopDwellMetrics.length,
                matched: diagnostics.fullyMatched,
                mismatch: diagnostics.tripIdMismatch,
                spatialRejected: diagnostics.spatialRejected,
            });
            // Perform the batch write to PostgreSQL
            await (0, db_1.insertVehiclePositions)(matchedPositions);
            await (0, db_1.insertSegmentMetrics)(segmentMetrics);
            await (0, db_1.insertStopDwellMetrics)(stopDwellMetrics);
            await (0, db_1.upsertRouteLastSeen)(agency.id, matchedPositions);
            // Final ingestion logging with Notion sync timestamp if available
            let syncedAt;
            let syncStatus;
            const now = Date.now();
            if (!lastNotionSync[agency.id] || now - lastNotionSync[agency.id] > NOTION_SYNC_THROTTLE_MS) {
                lastNotionSync[agency.id] = now;
                const syncRes = await (0, notion_sync_1.syncAgencyToNotion)(agency.id, { success: true, vehicleCount: matchedPositions.length });
                if (syncRes.success) {
                    syncedAt = syncRes.syncAt;
                    syncStatus = syncRes.syncStatus;
                }
            }
            else {
                syncStatus = 'Throttled (15m Cooldown)';
            }
            await (0, db_1.logIngestion)(agency.id, true, matchedPositions.length, undefined, syncedAt, syncStatus);
            logger_1.log.info('Queue', 'processed', {
                agency: agency.id,
                vehicles: matchedPositions.length,
                segments: segmentMetrics.length,
                dwells: stopDwellMetrics.length,
                jobId: job.id,
                synced: !!syncedAt
            });
        }
        catch (err) {
            const msg = err.message;
            await (0, db_1.logIngestion)(agency.id, false, undefined, msg).catch(() => undefined);
            logger_1.log.error('Queue', 'failed', { agency: agency.id, err: msg, jobId: job.id });
            // Sync failure status to Notion if throttled
            const now = Date.now();
            if (!lastNotionSync[agency.id] || now - lastNotionSync[agency.id] > NOTION_SYNC_THROTTLE_MS) {
                lastNotionSync[agency.id] = now;
                void (0, notion_sync_1.syncAgencyToNotion)(agency.id, {
                    success: false,
                    vehicleCount: null,
                    errorMsg: msg
                });
            }
            throw err; // Re-throw to trigger BullMQ retry logic
        }
    }, {
        connection: {
            url: REDIS_URL,
        },
        concurrency: 4, // Allow up to 4 concurrent matching jobs to saturate the CPU
    });
    worker.on('failed', (job, err) => {
        logger_1.log.error('Worker', 'Job critical failure', { id: job?.id, err: err.message });
    });
    logger_1.log.info('Worker', 'running', { queue: 'position-processing' });
    return worker;
}
