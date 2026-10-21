#!/usr/bin/env npx tsx
/**
 * Add `refDateQuality` to COPIES of existing History v2 sidecars (local only; no R2).
 *
 *   npx tsx pipeline/recompute-history-ref-quality.ts --sidecar-dir <dir of {periodKey}.json> \
 *     --zip-dir <dir of {periodKey}.zip> --out-dir <new dir>
 *
 * Sidecars are immutable, so the originals are never modified: --out-dir must differ from
 * --sidecar-dir. Each sidecar is matched to the zip with the same period key, and its refDate is
 * checked against the zip's calendar.txt / calendar_dates.txt / trips.txt (see historyRefQuality.ts).
 * Prints one table row per period (trips on refDate vs the median, and the verdict).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assessRefDate, readQualityRows } from './historyRefQuality.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const sidecarDir = arg('--sidecar-dir'), zipDir = arg('--zip-dir'), outDirArg = arg('--out-dir');
  if (!sidecarDir || !zipDir || !outDirArg) throw new Error('Usage: recompute-history-ref-quality.ts --sidecar-dir <dir> --zip-dir <dir> --out-dir <dir>');
  const outDir = resolve(outDirArg);
  if (outDir === resolve(sidecarDir)) throw new Error('--out-dir must differ from --sidecar-dir (sidecars are immutable)');
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(resolve(sidecarDir)).filter(n => /^[^.].*\.json$/.test(n) && !n.includes('report')).sort()) {
    const sc = JSON.parse(readFileSync(resolve(sidecarDir, f), 'utf8'));
    const zipPath = resolve(zipDir, f.replace(/\.json$/, '.zip'));
    if (!existsSync(zipPath)) { console.log(`${f}: no zip, copied unchanged`); writeFileSync(resolve(outDir, f), JSON.stringify(sc)); continue; }
    const a = assessRefDate(await readQualityRows(readFileSync(zipPath)), sc.refDate);
    sc.refDateQuality = { holiday: a.holiday, reason: a.reason, tripsOnRef: a.tripsOnRef, medianTrips: a.medianTrips };
    writeFileSync(resolve(outDir, f), JSON.stringify(sc));
    console.log([f, sc.refDate, a.dayType, a.tripsOnRef, a.medianTrips, a.ratio == null ? '?' : a.ratio.toFixed(2), a.holiday ? 'HOLIDAY' : 'keep'].join('\t'));
  }
}

main().catch(error => { console.error(error); process.exit(1); });
