#!/usr/bin/env npx tsx
/**
 * Write shared/data/history-agencies.json: the agencies that pass the History bar
 * (10+ distinct years), so the UI can mark them without loading the multi-MB
 * history-config.json. build-history.ts refreshes this file on every real run;
 * run this by hand to resync from what is live on R2:
 *   npm run build:history-agencies            # reads R2's atlas/history-config.json
 *   npm run build:history-agencies -- <file>  # reads a local history-config JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_R2_PUBLIC_URL } from '../shared/config.js';
import { buildHistoryAgencyList } from '../shared/historyEligibility.js';

export const HISTORY_AGENCY_LIST_PATH = resolve(import.meta.dirname, '../shared/data/history-agencies.json');

export function writeHistoryAgencyList(rows: Parameters<typeof buildHistoryAgencyList>[0]): number {
  const list = buildHistoryAgencyList(rows);
  writeFileSync(HISTORY_AGENCY_LIST_PATH, `${JSON.stringify(list, null, 2)}\n`);
  return list.slugs.length;
}

async function main() {
  const file = process.argv[2];
  const rows = file
    ? JSON.parse(readFileSync(resolve(file), 'utf8'))
    : await fetch(`${process.env.R2_PUBLIC_URL ?? DEFAULT_R2_PUBLIC_URL}/atlas/history-config.json`).then(r => {
      if (!r.ok) throw new Error(`history-config.json: HTTP ${r.status}`);
      return r.json();
    });
  const count = writeHistoryAgencyList(rows);
  console.log(`Wrote ${HISTORY_AGENCY_LIST_PATH} (${count} agencies)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch(err => { console.error(err); process.exit(1); });
}
