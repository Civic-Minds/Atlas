#!/usr/bin/env npx tsx
/**
 * Sync public/data/feed-refresh.json from .github/workflows/refresh-feeds.yml.
 * Pass --completed after a successful refresh run to stamp lastCompletedAt.
 *
 *   npm run sync-feed-refresh-meta
 *   npm run sync-feed-refresh-meta -- --completed
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ymlPath = resolve('.github/workflows/refresh-feeds.yml');
const outPath = resolve('public/data/feed-refresh.json');
const markComplete = process.argv.includes('--completed');

function extractScheduleCron(yml: string): string {
  const match = yml.match(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/m);
  if (!match) throw new Error('No schedule cron found in refresh-feeds.yml');
  return match[1];
}

const yml = readFileSync(ymlPath, 'utf8');
const scheduleCron = extractScheduleCron(yml);

let lastCompletedAt: string | null = null;
if (existsSync(outPath)) {
  try {
    const prev = JSON.parse(readFileSync(outPath, 'utf8')) as { lastCompletedAt?: string | null };
    lastCompletedAt = prev.lastCompletedAt ?? null;
  } catch {
    lastCompletedAt = null;
  }
}

if (markComplete) {
  lastCompletedAt = new Date().toISOString();
}

const payload = {
  scheduleCron,
  lastCompletedAt,
};

writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`feed-refresh.json updated (cron: ${scheduleCron}${markComplete ? ', marked complete' : ''})`);
