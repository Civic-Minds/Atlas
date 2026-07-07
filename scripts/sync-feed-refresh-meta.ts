#!/usr/bin/env npx tsx
/**
 * Sync scheduleCron in public/data/feed-refresh.json from refresh-feeds.yml.
 * lastCompletedAt lives on R2 (atlas/feed-refresh-meta.json), not in git.
 *
 *   npm run sync-feed-refresh-meta
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ymlPath = resolve('.github/workflows/refresh-feeds.yml');
const outPath = resolve('public/data/feed-refresh.json');

function extractScheduleCron(yml: string): string {
  const match = yml.match(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/m);
  if (!match) throw new Error('No schedule cron found in refresh-feeds.yml');
  return match[1];
}

const yml = readFileSync(ymlPath, 'utf8');
const scheduleCron = extractScheduleCron(yml);

writeFileSync(outPath, JSON.stringify({ scheduleCron }, null, 2) + '\n');
console.log(`feed-refresh.json updated (cron: ${scheduleCron})`);
