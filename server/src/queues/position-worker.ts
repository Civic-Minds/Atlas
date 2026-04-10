import { Worker, Job } from 'bullmq';
import { Agency, VehiclePosition } from '../types';
import { insertVehiclePositions, insertSegmentMetrics, insertStopDwellMetrics, logIngestion, upsertRouteLastSeen } from '../storage/db';
import { matchPositions } from '../intelligence/matcher';
import { syncAgencyToNotion } from '../intelligence/notion-sync';
import { log } from '../logger';

// Throttle Notion syncs to once every 15 minutes per agency to avoid rate limits
const lastNotionSync: Record<string, number> = {};
const NOTION_SYNC_THROTTLE_MS = 15 * 60 * 1000;


const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

interface PositionJobData {
    agency: Agency;
    positions: VehiclePosition[];
}

/**
 * Background worker to consume matching and insertion jobs from Redis.
 * This prevents blocking the main 30-second poller.
 */
export function startPositionWorker(): Worker {
    const worker = new Worker<PositionJobData>(
        'position-processing',
        async (job: Job<PositionJobData>) => {
            const { agency, positions: rawPositions } = job.data;
            log.info('Queue', 'starting job', { agency: agency.id, jobId: job.id });
            
            try {
                // Perform the heavy spatial math (schedule matching) in the background
                const { matchedPositions, segmentMetrics, stopDwellMetrics } = await matchPositions(agency, rawPositions);
                log.info('Queue', 'matching finished', { 
                    agency: agency.id, 
                    count: matchedPositions.length, 
                    segments: segmentMetrics.length,
                    dwells: stopDwellMetrics.length 
                });
                
                // Perform the batch write to PostgreSQL
                await insertVehiclePositions(matchedPositions);
                await insertSegmentMetrics(segmentMetrics);
                await insertStopDwellMetrics(stopDwellMetrics);
                await upsertRouteLastSeen(agency.id, matchedPositions);
                
                // Final ingestion logging with Notion sync timestamp if available
                let syncedAt: Date | undefined;
                let syncStatus: string | undefined;

                const now = Date.now();
                if (!lastNotionSync[agency.id] || now - lastNotionSync[agency.id] > NOTION_SYNC_THROTTLE_MS) {
                    lastNotionSync[agency.id] = now;
                    const syncRes = await syncAgencyToNotion(agency.id, { success: true, vehicleCount: matchedPositions.length });
                    if (syncRes.success) {
                        syncedAt = syncRes.syncAt;
                        syncStatus = syncRes.syncStatus;
                    }
                } else {
                    syncStatus = 'Throttled (15m Cooldown)';
                }

                await logIngestion(agency.id, true, matchedPositions.length, undefined, syncedAt, syncStatus);
                
                log.info('Queue', 'processed', { 
                    agency: agency.id, 
                    vehicles: matchedPositions.length,
                    segments: segmentMetrics.length,
                    dwells: stopDwellMetrics.length,
                    jobId: job.id,
                    synced: !!syncedAt
                });
            } catch (err) {
                const msg = (err as Error).message;
                await logIngestion(agency.id, false, undefined, msg).catch(() => undefined);
                log.error('Queue', 'failed', { agency: agency.id, err: msg, jobId: job.id });

                // Sync failure status to Notion if throttled
                const now = Date.now();
                if (!lastNotionSync[agency.id] || now - lastNotionSync[agency.id] > NOTION_SYNC_THROTTLE_MS) {
                    lastNotionSync[agency.id] = now;
                    void syncAgencyToNotion(agency.id, { 
                        success: false, 
                        vehicleCount: null,
                        errorMsg: msg
                    });
                }

                throw err; // Re-throw to trigger BullMQ retry logic
            }


        },
        {
            connection: {
                url: REDIS_URL,
            },
            concurrency: 4, // Allow up to 4 concurrent matching jobs to saturate the CPU
        }
    );

    worker.on('failed', (job, err) => {
        log.error('Worker', 'Job critical failure', { id: job?.id, err: err.message });
    });

    log.info('Worker', 'running', { queue: 'position-processing' });

    return worker;
}
