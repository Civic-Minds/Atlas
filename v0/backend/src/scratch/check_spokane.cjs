const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function checkSpokane() {
  const pool = new Pool({
    connectionString: process.env.STATIC_DATABASE_URL || 'postgresql://localhost/atlas_static'
  });
  
  console.log('Checking for any Spokane-like data in atlas_static...');

  try {
    const res = await pool.query(`
      SELECT DISTINCT r.gtfs_route_id, r.route_short_name, r.route_long_name, a.agency_slug
      FROM routes r 
      JOIN feed_versions v ON r.feed_version_id = v.id
      JOIN gtfs_agencies a ON v.gtfs_agency_id = a.id
      ORDER BY r.gtfs_route_id;
    `);

    console.log(`Found ${res.rows.length} total across all agencies:`);
    const spokaneRoutes = res.rows.filter(r => r.agency_slug.toLowerCase().includes('sta') || r.agency_slug.toLowerCase().includes('spokane'));
    console.log(`Spokane matches: ${JSON.stringify(spokaneRoutes, null, 2)}`);

  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await pool.end();
  }
}

checkSpokane();
