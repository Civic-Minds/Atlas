import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.STATIC_DATABASE_URL
});

async function checkSTA() {
  try {
    const res = await pool.query(`
      SELECT route_short_name, route_long_name 
      FROM gtfs_routes 
      WHERE agency_id = 'sta' 
      ORDER BY route_short_name ASC;
    `);
    console.log(`Found ${res.rowCount} routes for STA.`);
    res.rows.forEach(r => {
      console.log(`- ${r.route_short_name}: ${r.route_long_name}`);
    });
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await pool.end();
  }
}

checkSTA();
