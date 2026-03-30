import { Pool } from 'pg';

let staticPool: Pool | null = null;

export function getStaticPool(): Pool {
  if (!staticPool) {
    staticPool = new Pool({
      connectionString: process.env.STATIC_DATABASE_URL ?? 'postgresql://ubuntu:ouija@localhost/static',
    });
  }
  return staticPool;
}

/**
 * Finds the currently active feed_version_id for an agency slug (e.g. 'ttc').
 * Used during ingestion to link real-time positions to the correct static schedule.
 */
export async function getAgencyFeedVersion(agencySlug: string): Promise<string | null> {
  const db = getStaticPool();
  const res = await db.query(
    `SELECT v.id FROM feed_versions v
     JOIN gtfs_agencies a ON v.gtfs_agency_id = a.id
     WHERE a.agency_slug = $1 AND v.is_current = TRUE`,
    [agencySlug]
  );
  return res.rows[0]?.id ?? null;
}
