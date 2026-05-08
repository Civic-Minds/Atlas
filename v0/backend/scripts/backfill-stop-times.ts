/**
 * One-off script: backfill stop_times for a specific feed version.
 * Uses ON CONFLICT DO NOTHING so it's safe to run on a partially-written version.
 *
 * Usage:
 *   STATIC_DATABASE_URL=... node dist-scripts/scripts/backfill-stop-times.js <zip-path> <feed-version-id>
 */

import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { Pool } from 'pg';
import JSZip from 'jszip';
import Papa from 'papaparse';

async function main() {
  const [,, zipPath, feedVersionId] = process.argv;
  if (!zipPath || !feedVersionId) {
    console.error('Usage: node backfill-stop-times.js <zip-path> <feed-version-id>');
    process.exit(1);
  }

  const db = new Pool({ connectionString: process.env.STATIC_DATABASE_URL ?? 'postgresql://localhost/static' });

  // Resolve agency_account_id from feed version
  const fvRes = await db.query('SELECT agency_account_id FROM feed_versions WHERE id = $1', [feedVersionId]);
  if (!fvRes.rows.length) { console.error('Feed version not found:', feedVersionId); process.exit(1); }
  const accountId = fvRes.rows[0].agency_account_id;

  const before = await db.query<{count:string}>('SELECT COUNT(*)::text FROM stop_times WHERE feed_version_id = $1', [feedVersionId]);
  console.log(`stop_times before: ${before.rows[0].count}`);

  const parseTime = (raw: string) => {
    const p = raw?.split(':');
    if (!p || p.length < 2) return null;
    return parseInt(p[0]) * 60 + parseInt(p[1]);
  };

  const zipBuffer = fs.readFileSync(path.resolve(zipPath));
  const zip = await JSZip.loadAsync(zipBuffer);
  const stPath = zip.file('stop_times.txt') ? 'stop_times.txt'
    : Object.keys(zip.files).find(f => f.endsWith('/stop_times.txt')) ?? '';
  if (!stPath) { console.error('stop_times.txt not found in zip'); process.exit(1); }

  const BATCH = 10_000;
  let bTripIds: string[] = [], bStopIds: string[] = [], bSeqs: (number|null)[] = [];
  let bArrivals: (number|null)[] = [], bDepartures: (number|null)[] = [];
  let bPickup: number[] = [], bDropOff: number[] = [];
  let total = 0;

  const flush = async () => {
    if (!bTripIds.length) return;
    await db.query(
      `INSERT INTO stop_times
         (feed_version_id, agency_account_id, gtfs_trip_id, gtfs_stop_id,
          stop_sequence, arrival_time, departure_time, pickup_type, drop_off_type)
       SELECT $1,$2,unnest($3::text[]),unnest($4::text[]),
              unnest($5::int[]),unnest($6::int[]),unnest($7::int[]),
              unnest($8::int[]),unnest($9::int[])
       ON CONFLICT (feed_version_id, gtfs_trip_id, stop_sequence) DO NOTHING`,
      [feedVersionId, accountId, bTripIds, bStopIds, bSeqs, bArrivals, bDepartures, bPickup, bDropOff]
    );
    total += bTripIds.length;
    console.log(`  written: ${total.toLocaleString()}`);
    bTripIds=[]; bStopIds=[]; bSeqs=[]; bArrivals=[]; bDepartures=[]; bPickup=[]; bDropOff=[];
  };

  await new Promise<void>((resolve, reject) => {
    Papa.parse(zip.file(stPath)!.nodeStream() as any, {
      header: true, skipEmptyLines: true,
      transform: (v: string) => v.trim(),
      step: async (row: {data: any}, parser: any) => {
        const st = row.data;
        bTripIds.push(st.trip_id); bStopIds.push(st.stop_id);
        bSeqs.push(parseInt(st.stop_sequence) || null);
        bArrivals.push(parseTime(st.arrival_time));
        bDepartures.push(parseTime(st.departure_time));
        bPickup.push(parseInt(st.pickup_type) || 0);
        bDropOff.push(parseInt(st.drop_off_type) || 0);
        if (bTripIds.length >= BATCH) {
          parser.pause();
          try { await flush(); } catch(e) { reject(e); return; }
          parser.resume();
        }
      },
      complete: async () => { try { await flush(); resolve(); } catch(e) { reject(e); } },
      error: (err: any) => reject(err),
    });
  });

  const after = await db.query<{count:string}>('SELECT COUNT(*)::text FROM stop_times WHERE feed_version_id = $1', [feedVersionId]);
  console.log(`\nDone. stop_times after: ${after.rows[0].count}`);
  await db.end();
}

main().catch(err => { console.error(err); process.exit(1); });
