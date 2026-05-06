"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const pool = new pg_1.Pool({
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
    }
    catch (err) {
        console.error('Error querying DB:', err);
    }
    finally {
        await pool.end();
    }
}
checkSTA();
