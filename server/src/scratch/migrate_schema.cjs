const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/atlas_lab'
  });
  
  console.log('Starting migration with pg direct to atlas_lab...');

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS route_last_seen (
        agency_id  TEXT NOT NULL,
        route_id   TEXT NOT NULL,
        last_seen  TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (agency_id, route_id)
      );
    `);
    console.log('Created route_last_seen table.');

    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='vehicle_positions' AND column_name='shape_id';
    `);

    if (checkColumn.rows.length === 0) {
      await pool.query(`
        ALTER TABLE vehicle_positions ADD COLUMN shape_id TEXT;
      `);
      console.log('Added shape_id column.');
    } else {
      console.log('shape_id column already exists.');
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
