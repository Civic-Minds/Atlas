import { Queue } from 'bullmq';
import { Agency, VehiclePosition } from '../types';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// The 'position-processing' queue handles heavy spatial matching and DB writes.
export const positionQueue = new Queue('position-processing', {
    connection: {
        url: REDIS_URL,
    },
});

/**
 * Pushes raw GTFS-RT position payloads to the Redis queue.
 */
export async function pushToProcessingQueue(agency: Agency, positions: VehiclePosition[]): Promise<void> {
    await positionQueue.add(
        `process-${agency.id}-${Date.now()}`,
        { agency, positions },
        {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000, // 5s initial retry backoff
            },
            removeOnComplete: true, // Keep Redis clean
            removeOnFail: 1000, // Keep last 1,000 failed jobs for debugging
        }
    );
}
