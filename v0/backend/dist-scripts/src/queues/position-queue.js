"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionQueue = void 0;
exports.pushToProcessingQueue = pushToProcessingQueue;
const bullmq_1 = require("bullmq");
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// The 'position-processing' queue handles heavy spatial matching and DB writes.
exports.positionQueue = new bullmq_1.Queue('position-processing', {
    connection: {
        url: REDIS_URL,
    },
});
/**
 * Pushes raw GTFS-RT position payloads to the Redis queue.
 */
async function pushToProcessingQueue(agency, positions) {
    await exports.positionQueue.add(`process-${agency.id}-${Date.now()}`, { agency, positions }, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s initial retry backoff
        },
        removeOnComplete: true, // Keep Redis clean
        removeOnFail: 1000, // Keep last 1,000 failed jobs for debugging
    });
}
