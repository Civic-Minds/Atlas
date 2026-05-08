const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function listAgencies() {
  const pool = new Pool({
    connectionString: process.env.STATIC_DATABASE_URL || 'postgresql://localhost/atlas_static'
  });
  
  console.log('Listing all agencies in atlas_static...');

  try {
    const res = await pool.query(`
      SELECT id, agency_slug, display_name FROM gtfs_agencies;
    `);

    res.rows.forEach(r => {
      console.log(`- ${r.agency_slug}: ${r.display_name} (ID: ${r.id})`);
    });

    const spokane = res.rows.find(a => a.agency_slug.toLowerCase().includes('spokane'));
    if (spokane) {
      console.log(`Found spokane agency: ${spokane.agency_slug}`);
      const versions = await pool.query(`SELECT id, is_current, status FROM feed_versions WHERE gtfs_agency_id = $1`, [spokane.id]);
      console.log(`Found ${versions.rows.length} feed versions for Spokane:`);
      versions.rows.forEach(v => console.log(`  - Version ${v.id}: current=${v.is_current}, status=${v.status}`));
    } else {
      console.log('Spokane agency NOT FOUND in gtfs_agencies.');
    }
  } catch (err) {
    console.error('List failed:', err);
  } finally {
    await pool.end();
  }
}

listAgencies();
