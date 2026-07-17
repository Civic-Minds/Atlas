#!/usr/bin/env npx tsx
/**
 * Derive a `cities` list per agency from its real stop coordinates (nearest
 * gazetteer city by stop density — see pipeline/deriveCities.ts) and write it
 * into config/agencies/{slug}.json. Run `npm run build:agency-index` after.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveCitiesFromStops } from '../pipeline/deriveCities';
import { R2_PUBLIC_URL } from '../shared/config';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'config/agencies');
const onlySlugs = process.argv.slice(2);

const files = readdirSync(sourceDir)
  .filter(name => name.endsWith('.json'))
  .filter(name => name !== 'order.json');

let updated = 0;
let skippedNoStops = 0;
let skippedNoMatch = 0;
const failed: string[] = [];

for (const file of files) {
  const path = resolve(sourceDir, file);
  const agency = JSON.parse(readFileSync(path, 'utf8'));
  if (onlySlugs.length > 0 && !onlySlugs.includes(agency.slug)) continue;

  const stopsUrl = `${R2_PUBLIC_URL}/atlas/${agency.slug}-stops.json`;
  try {
    const res = await fetch(stopsUrl);
    if (!res.ok) { skippedNoStops++; continue; }
    const data = await res.json() as Record<string, { lat: number; lon: number }>;
    const stops = Object.values(data);
    if (stops.length === 0) { skippedNoStops++; continue; }

    const cities = deriveCitiesFromStops(stops);
    if (cities.length === 0) { skippedNoMatch++; continue; }

    agency.cities = cities;
    writeFileSync(path, `${JSON.stringify(agency, null, 2)}\n`);
    updated++;
    console.log(`${agency.slug}: ${cities.join(' / ')}`);
  } catch (err) {
    failed.push(agency.slug);
    console.error(`${agency.slug}: FAILED — ${(err as Error).message}`);
  }
}

console.log(`\nUpdated ${updated} agencies. No-stops: ${skippedNoStops}. No-gazetteer-match: ${skippedNoMatch}. Failed: ${failed.length}${failed.length ? ` (${failed.join(', ')})` : ''}.`);
