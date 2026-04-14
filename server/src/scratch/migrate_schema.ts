import { getPool } from '../server/src/storage/db';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
  const db = getPool();
  console.log('Starting migration...');

  try {
    // 1. Add route_last_seen table
    console.log('Creating route_last_seen table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS route_last_seen (
        agency_id  TEXT NOT NULL,
        route_id   TEXT NOT NULL,
        last_seen  TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (agency_id, route_id)
      );
    `);

    // 2. Add shape_id to vehicle_positions
    console.log('Adding shape_id to vehicle_positions...');
    // Check if column exists first to avoid error
    const checkColumn = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='vehicle_positions' AND column_name='shape_id';
    `);

    if (checkColumn.rows.length === 0) {
      await db.query(`
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
    await db.end();
  }
}

migrate();
