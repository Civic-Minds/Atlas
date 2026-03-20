/**
 * stress-test.ts
 *
 * Batch-validates and analyses every GTFS .zip in /Users/ryan/Desktop/Data/GTFS.
 *
 * For each feed:
 *   1. Parse the ZIP (parseGtfsZip)
 *   2. Validate the feed (validateGtfs) — report errors/warnings
 *   3. Skip analysis if any critical file-presence errors (E001–E005)
 *   4. Otherwise run the full pipeline and report tier distribution
 *
 * Run: npx tsx scripts/stress-test.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { parseGtfsZip } from '../src/core/parseGtfs.js';
import { validateGtfs } from '../src/core/validation.js';
import { computeRawDepartures } from '../src/core/transit-phase1.js';
import { applyAnalysisCriteria } from '../src/core/transit-phase2.js';
import { DEFAULT_CRITERIA } from '../src/core/defaults.js';

const GTFS_ROOT = '/Users/ryan/Desktop/Data/GTFS';
const CRITICAL_ERROR_CODES = new Set(['E001', 'E002', 'E003', 'E004', 'E005']);

// Feeds that can't be parsed with the standard parser — skip with explanation
const KNOWN_SKIP: Record<string, string> = {
    'Melbourne PTV':       'nested-zip (11 sub-zips inside)',
    'Philadelphia SEPTA':  'nested-zip (google_bus.zip + google_rail.zip inside)',
    'UK National Rail':    'gzip format, not standard zip',
};

const TIER_ORDER = ['5', '8', '10', '15', '20', '30', '60', 'span'];
const TIER_LABELS: Record<string, string> = {
    '5': 'Rapid', '8': 'Freq++', '10': 'Freq+', '15': 'Freq',
    '20': 'Good', '30': 'Basic', '60': 'Infreq', 'span': 'Span',
};

// ANSI colours
const R = '\x1b[31m', Y = '\x1b[33m', G = '\x1b[32m', C = '\x1b[36m', DIM = '\x1b[2m', RST = '\x1b[0m';

// ── Helpers ─────────────────────────────────────────────────────────────────

function walkZips(dir: string): string[] {
    const results: string[] = [];
    try {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            try {
                const stat = statSync(full);
                if (stat.isDirectory()) results.push(...walkZips(full));
                else if (entry.endsWith('.zip')) results.push(full);
            } catch { /* skip inaccessible entries */ }
        }
    } catch { /* skip inaccessible dirs */ }
    return results;
}

function pad(s: string, n: number, right = false): string {
    const str = String(s);
    return right ? str.padStart(n) : str.padEnd(n);
}

// ── Result types ─────────────────────────────────────────────────────────────

interface FeedResult {
    name: string;
    path: string;
    status: 'ok' | 'skipped' | 'error';
    errorMsg?: string;
    routes: number;
    trips: number;
    stops: number;
    analysisRoutes: number;  // routes that produced Weekday results
    tiers: Record<string, number>;
    validationErrors: number;
    validationWarnings: number;
    criticalIssues: string[];
    parseMs: number;
    analysisMs: number;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const zips = walkZips(GTFS_ROOT).sort();
    console.log(`\n${C}Atlas GTFS Stress Test${RST}  —  ${zips.length} feeds found in ${GTFS_ROOT}\n`);

    const results: FeedResult[] = [];
    let i = 0;

    for (const zipPath of zips) {
        i++;
        const name = basename(zipPath, '.zip');
        process.stdout.write(`[${String(i).padStart(3)}/${zips.length}]  ${pad(name, 40)} `);

        if (KNOWN_SKIP[name]) {
            process.stdout.write(`${DIM}SKIPPED — ${KNOWN_SKIP[name]}${RST}\n`);
            continue;
        }

        const result: FeedResult = {
            name,
            path: zipPath,
            status: 'ok',
            routes: 0, trips: 0, stops: 0,
            analysisRoutes: 0,
            tiers: {},
            validationErrors: 0,
            validationWarnings: 0,
            criticalIssues: [],
            parseMs: 0,
            analysisMs: 0,
        };

        // 1. Parse
        let gtfsData;
        const parseStart = Date.now();
        try {
            const buf = readFileSync(zipPath);
            // JSZip accepts Buffer (Uint8Array subclass) directly even though TS type says ArrayBuffer
            gtfsData = await parseGtfsZip(buf as unknown as ArrayBuffer);
            result.parseMs = Date.now() - parseStart;
        } catch (err) {
            result.status = 'error';
            result.errorMsg = err instanceof Error ? err.message : String(err);
            result.parseMs = Date.now() - parseStart;
            process.stdout.write(`${R}PARSE ERROR${RST}\n`);
            results.push(result);
            continue;
        }

        result.routes = gtfsData.routes?.length ?? 0;
        result.trips  = gtfsData.trips?.length ?? 0;
        result.stops  = gtfsData.stops?.length ?? 0;

        // 2. Validate
        const report = validateGtfs(gtfsData, name);
        result.validationErrors   = report.errors;
        result.validationWarnings = report.warnings;

        const critical = report.issues.filter(i => CRITICAL_ERROR_CODES.has(i.code));
        result.criticalIssues = critical.map(i => i.code);

        if (critical.length > 0) {
            result.status = 'skipped';
            process.stdout.write(`${Y}SKIPPED${RST} (${critical.map(i => i.code).join(', ')})\n`);
            results.push(result);
            continue;
        }

        // 3. Analysis
        const analysisStart = Date.now();
        try {
            const rawDepartures = computeRawDepartures(gtfsData);
            const analysisResults = applyAnalysisCriteria(rawDepartures, DEFAULT_CRITERIA);
            result.analysisMs = Date.now() - analysisStart;

            const weekdayResults = analysisResults.filter(r => r.day === 'Weekday');
            result.analysisRoutes = weekdayResults.length;

            for (const r of weekdayResults) {
                result.tiers[r.tier] = (result.tiers[r.tier] ?? 0) + 1;
            }

            const warnStr = result.validationWarnings > 0 ? ` ${Y}${result.validationWarnings}W${RST}` : '';
            const errStr  = result.validationErrors  > 0 ? ` ${R}${result.validationErrors}E${RST}` : '';
            process.stdout.write(`${G}OK${RST}  ${pad(String(result.analysisRoutes), 4, true)} routes${warnStr}${errStr}\n`);
        } catch (err) {
            result.status = 'error';
            result.errorMsg = err instanceof Error ? err.message : String(err);
            result.analysisMs = Date.now() - analysisStart;
            process.stdout.write(`${R}ANALYSIS ERROR${RST}\n`);
        }

        results.push(result);
    }

    // ── Summary table ─────────────────────────────────────────────────────────

    const ok      = results.filter(r => r.status === 'ok');
    const skipped = results.filter(r => r.status === 'skipped');
    const errors  = results.filter(r => r.status === 'error');

    console.log(`\n${'─'.repeat(120)}`);
    console.log(`${C}RESULTS: ${G}${ok.length} OK${RST}  ${Y}${skipped.length} skipped${RST}  ${R}${errors.length} errors${RST}  of ${results.length} total`);
    console.log('─'.repeat(120));

    // Header
    const tierCols = TIER_ORDER.map(t => pad(TIER_LABELS[t], 7, true));
    console.log(
        `${DIM}${pad('Feed', 42)} ${pad('Routes', 7, true)} ${pad('Trips', 8, true)} ${tierCols.join(' ')}  V.Err  V.Warn  Parse   Analysis${RST}`
    );
    console.log('─'.repeat(120));

    for (const r of results) {
        if (r.status === 'error') {
            console.log(`${R}${pad(r.name, 42)}${RST}  ${DIM}PARSE/ANALYSIS ERROR: ${r.errorMsg?.slice(0, 60)}${RST}`);
            continue;
        }
        if (r.status === 'skipped') {
            console.log(`${Y}${pad(r.name, 42)}${RST}  ${DIM}SKIPPED — ${r.criticalIssues.join(', ')}${RST}`);
            continue;
        }

        const tierCounts = TIER_ORDER.map(t => pad(String(r.tiers[t] ?? 0), 7, true));
        const vErr  = r.validationErrors   > 0 ? `${R}${pad(String(r.validationErrors), 5, true)}${RST}` : pad('0', 5, true);
        const vWarn = r.validationWarnings > 0 ? `${Y}${pad(String(r.validationWarnings), 6, true)}${RST}` : pad('0', 6, true);

        console.log(
            `${pad(r.name, 42)} ` +
            `${pad(String(r.analysisRoutes), 7, true)} ` +
            `${pad(String(r.trips), 8, true)} ` +
            `${tierCounts.join(' ')}  ${vErr}  ${vWarn}  ${pad(r.parseMs + 'ms', 7, true)}  ${pad(r.analysisMs + 'ms', 8, true)}`
        );
    }

    console.log('─'.repeat(120));

    // Tier totals across all OK feeds
    const totals: Record<string, number> = {};
    for (const r of ok) {
        for (const [tier, count] of Object.entries(r.tiers)) {
            totals[tier] = (totals[tier] ?? 0) + count;
        }
    }
    const totalRoutes = ok.reduce((s, r) => s + r.analysisRoutes, 0);
    const tierTotals = TIER_ORDER.map(t => pad(String(totals[t] ?? 0), 7, true));
    console.log(
        `${C}${pad('TOTALS (' + ok.length + ' feeds)', 42)}${RST} ` +
        `${pad(String(totalRoutes), 7, true)} ` +
        `${' '.repeat(9)}` +
        `${tierTotals.join(' ')}`
    );
    console.log('─'.repeat(120));

    // Error details
    if (errors.length > 0) {
        console.log(`\n${R}Parse/Analysis Errors:${RST}`);
        for (const r of errors) {
            console.log(`  ${r.name}: ${r.errorMsg}`);
        }
    }

    // Feeds with validation errors (not critical but worth reviewing)
    const withValErrors = ok.filter(r => r.validationErrors > 0);
    if (withValErrors.length > 0) {
        console.log(`\n${Y}Feeds with validation errors (analysis still ran):${RST}`);
        for (const r of withValErrors) {
            console.log(`  ${r.name}: ${r.validationErrors}E / ${r.validationWarnings}W`);
        }
    }

    console.log('');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
