"use strict";
/**
 * Admin script: import a GTFS feed directly into the static database.
 * Bypasses HTTP/auth — run locally or on OCI via ts-node.
 *
 * Usage:
 *   npx ts-node scripts/import-gtfs.ts <path-to-gtfs.zip> <accountSlug> <accountName> [label]
 *
 * Examples:
 *   npx ts-node scripts/import-gtfs.ts ttc.zip ttc "Toronto Transit Commission" "Spring 2025"
 *   npx ts-node scripts/import-gtfs.ts mbta.zip mbta "MBTA"
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
dotenv.config({ path: path_1.default.resolve(__dirname, '../.env') });
const importer_1 = require("../src/import/importer");
async function main() {
    const [, , zipPath, accountSlug, accountName, label] = process.argv;
    if (!zipPath || !accountSlug || !accountName) {
        console.error('Usage: npx ts-node scripts/import-gtfs.ts <path-to-gtfs.zip> <accountSlug> <accountName> [label]');
        process.exit(1);
    }
    const resolved = path_1.default.resolve(zipPath);
    if (!fs_1.default.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(1);
    }
    const zipBuffer = fs_1.default.readFileSync(resolved);
    const filename = path_1.default.basename(resolved);
    console.log(`Importing ${filename} as account "${accountSlug}" (${accountName})...`);
    const start = Date.now();
    try {
        const result = await (0, importer_1.importGtfsFeed)({
            zipBuffer,
            filename,
            accountSlug,
            accountName,
            label: label || undefined,
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`\nDone in ${elapsed}s`);
        console.log(`  Feed version: ${result.feedVersionId}`);
        console.log(`  Routes:       ${result.routeCount}`);
        console.log(`  Stops:        ${result.stopCount}`);
        console.log(`  Trips:        ${result.tripCount}`);
        console.log(`  Analysis:     ${result.analysisResultCount} results`);
        console.log(`  Effective:    ${result.effectiveFrom} → ${result.effectiveTo}`);
        process.exit(0);
    }
    catch (err) {
        console.error('Import failed:', err);
        process.exit(1);
    }
}
main();
