import { getPool } from '../storage/db';
import { log } from '../logger';

/**
 * Feed Health Engine (Phase 2)
 *
 * Computes a 0-100 composite score for agency feed reliability.
 */

export interface FeedHealthScore {
  agencyId: string;
  compositeScore: number;
  vehicleCountStability: number; // 0-100
  tripAssignmentRate: number;    // 0-100
  positionPlausibility: number;  // 0-100
}

export async function calculateAgencyHealth(agencyId: string): Promise<FeedHealthScore> {
  const pool = getPool();
  
  log.info('Health', 'Calculating feed health', { agencyId });

  // 1. Position Plausibility (% high confidence matches in last 5m)
  const confidenceRows = await pool.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(CASE WHEN match_confidence >= 0.7 THEN 1 END) as plausible
     FROM vehicle_positions
     WHERE agency_id = $1 AND observed_at >= NOW() - INTERVAL '5 minutes'`,
    [agencyId]
  );
  
  const plausibilityRes = confidenceRows.rows[0];
  const positionPlausibility = plausibilityRes.total > 0 
    ? (plausibilityRes.plausible / plausibilityRes.total) * 100 
    : 0;

  // 2. Trip Assignment Rate (% positions with trip_id)
  const assignmentRows = await pool.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(trip_id) as assigned
     FROM vehicle_positions
     WHERE agency_id = $1 AND observed_at >= NOW() - INTERVAL '5 minutes'`,
    [agencyId]
  );
  
  const assignmentRes = assignmentRows.rows[0];
  const tripAssignmentRate = assignmentRes.total > 0
    ? (assignmentRes.assigned / assignmentRes.total) * 100
    : 0;

  // 3. Vehicle Count Stability (StdDev of counts over last 10 snapshots)
  // We check the last 10 distinct timestamp snapshots for this agency
  const stabilityRows = await pool.query(
    `WITH snapshots AS (
       SELECT observed_at, COUNT(DISTINCT vehicle_id) as v_count
       FROM vehicle_positions
       WHERE agency_id = $1 AND observed_at >= NOW() - INTERVAL '15 minutes'
       GROUP BY observed_at
       ORDER BY observed_at DESC
       LIMIT 10
     )
     SELECT AVG(v_count) as avg_v, STDDEV(v_count) as stddev_v
     FROM snapshots`,
    [agencyId]
  );

  const stabilityRes = stabilityRows.rows[0];
  let vehicleCountStability = 100;
  
  if (stabilityRes.avg_v > 0) {
    const cv = (stabilityRes.stddev_v || 0) / stabilityRes.avg_v;
    // Stability = 100 * (1 - (CV * 2)) capped at 0-100
    // A CV of 0.5 (heavy jumping) results in 0 stability
    vehicleCountStability = Math.max(0, Math.min(100, Math.round(100 * (1 - (cv * 2)))));
  } else {
    vehicleCountStability = 0;
  }

  // Composite Score (Weighted Average)
  // 40% Plausibility, 40% Assignment, 20% Stability
  const compositeScore = Math.round(
    (positionPlausibility * 0.4) + 
    (tripAssignmentRate * 0.4) + 
    (vehicleCountStability * 0.2)
  );

  return {
    agencyId,
    compositeScore,
    vehicleCountStability,
    tripAssignmentRate,
    positionPlausibility
  };
}
