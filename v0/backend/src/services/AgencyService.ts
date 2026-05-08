import { getPool, getTenantForUser, type UserTenantInfo } from '../storage/db';
import { getStaticPool } from '../storage/static-db';

export class AgencyService {
  static async getProfile(uid: string, email: string, name?: string) {
    const tenant = await getTenantForUser(uid);
    return {
      uid,
      email,
      name: name ?? email?.split('@')[0],
      agencyId: tenant?.agencyId ?? null, // null means Global Admin
      role: tenant?.role ?? 'admin'
    };
  }

  static async getAgencies() {
    const pool = getStaticPool();
    const result = await pool.query(
      `SELECT aa.slug, aa.display_name, aa.country_code, aa.region,
              fv.id as feed_version_id, fv.route_count, fv.effective_from, fv.effective_to
       FROM agency_accounts aa
       LEFT JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
       LEFT JOIN feed_versions fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
       ORDER BY aa.display_name ASC`
    );
    return result.rows;
  }

  static async getAgencyBySlug(slug: string) {
    const pool = getStaticPool();
    const result = await pool.query(
      `SELECT fv.id AS feed_version_id
       FROM agency_accounts aa
       JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
       JOIN feed_versions  fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
       WHERE aa.slug = $1
       LIMIT 1`,
      [slug]
    );
    return result.rows[0];
  }
}
