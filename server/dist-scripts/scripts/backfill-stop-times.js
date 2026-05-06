"use strict";
/**
 * One-off script: backfill stop_times for a specific feed version.
 * Uses ON CONFLICT DO NOTHING so it's safe to run on a partially-written version.
 *
 * Usage:
 *   STATIC_DATABASE_URL=... node dist-scripts/scripts/backfill-stop-times.js <zip-path> <feed-version-id>
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const pg_1 = require("pg");
const jszip_1 = __importDefault(require("jszip"));
const papaparse_1 = __importDefault(require("papaparse"));
async function main() {
    const [, , zipPath, feedVersionId] = process.argv;
    if (!zipPath || !feedVersionId) {
        console.error('Usage: node backfill-stop-times.js <zip-path> <feed-version-id>');
        process.exit(1);
    }
    const db = new pg_1.Pool({ connectionString: process.env.STATIC_DATABASE_URL ?? 'postgresql://localhost/static' });
    // Resolve agency_account_id from feed version
    const fvRes = await db.query('SELECT agency_account_id FROM feed_versions WHERE id = $1', [feedVersionId]);
    if (!fvRes.rows.length) {
        console.error('Feed version not found:', feedVersionId);
        process.exit(1);
    }
    const accountId = fvRes.rows[0].agency_account_id;
    const before = await db.query('SELECT COUNT(*)::text FROM stop_times WHERE feed_version_id = $1', [feedVersionId]);
    console.log(`stop_times before: ${before.rows[0].count}`);
    const parseTime = (raw) => {
        const p = raw?.split(':');
        if (!p || p.length < 2)
            return null;
        return parseInt(p[0]) * 60 + parseInt(p[1]);
    };
    const zipBuffer = fs_1.default.readFileSync(path_1.default.resolve(zipPath));
    const zip = await jszip_1.default.loadAsync(zipBuffer);
    const stPath = zip.file('stop_times.txt') ? 'stop_times.txt'
        : Object.keys(zip.files).find(f => f.endsWith('/stop_times.txt')) ?? '';
    if (!stPath) {
        console.error('stop_times.txt not found in zip');
        process.exit(1);
    }
    const BATCH = 10000;
    let bTripIds = [], bStopIds = [], bSeqs = [];
    let bArrivals = [], bDepartures = [];
    let bPickup = [], bDropOff = [];
    let total = 0;
    const flush = async () => {
        if (!bTripIds.length)
            return;
        await db.query(`INSERT INTO stop_times
         (feed_version_id, agency_account_id, gtfs_trip_id, gtfs_stop_id,
          stop_sequence, arrival_time, departure_time, pickup_type, drop_off_type)
       SELECT $1,$2,unnest($3::text[]),unnest($4::text[]),
              unnest($5::int[]),unnest($6::int[]),unnest($7::int[]),
              unnest($8::int[]),unnest($9::int[])
       ON CONFLICT (feed_version_id, gtfs_trip_id, stop_sequence) DO NOTHING`, [feedVersionId, accountId, bTripIds, bStopIds, bSeqs, bArrivals, bDepartures, bPickup, bDropOff]);
        total += bTripIds.length;
        console.log(`  written: ${total.toLocaleString()}`);
        bTripIds = [];
        bStopIds = [];
        bSeqs = [];
        bArrivals = [];
        bDepartures = [];
        bPickup = [];
        bDropOff = [];
    };
    await new Promise((resolve, reject) => {
        papaparse_1.default.parse(zip.file(stPath).nodeStream(), {
            header: true, skipEmptyLines: true,
            transform: (v) => v.trim(),
            step: async (row, parser) => {
                const st = row.data;
                bTripIds.push(st.trip_id);
                bStopIds.push(st.stop_id);
                bSeqs.push(parseInt(st.stop_sequence) || null);
                bArrivals.push(parseTime(st.arrival_time));
                bDepartures.push(parseTime(st.departure_time));
                bPickup.push(parseInt(st.pickup_type) || 0);
                bDropOff.push(parseInt(st.drop_off_type) || 0);
                if (bTripIds.length >= BATCH) {
                    parser.pause();
                    try {
                        await flush();
                    }
                    catch (e) {
                        reject(e);
                        return;
                    }
                    parser.resume();
                }
            },
            complete: async () => { try {
                await flush();
                resolve();
            }
            catch (e) {
                reject(e);
            } },
            error: (err) => reject(err),
        });
    });
    const after = await db.query('SELECT COUNT(*)::text FROM stop_times WHERE feed_version_id = $1', [feedVersionId]);
    console.log(`\nDone. stop_times after: ${after.rows[0].count}`);
    await db.end();
}
main().catch(err => { console.error(err); process.exit(1); });
