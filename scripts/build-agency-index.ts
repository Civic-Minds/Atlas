#!/usr/bin/env npx tsx
/** Generate the runtime agency index from the per-agency source files. */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'config/agencies');
const outputPath = resolve(root, 'public/data/index.json');
const orderPath = resolve(sourceDir, 'order.json');

const files = readdirSync(sourceDir)
  .filter(name => name.endsWith('.json'))
  .filter(name => name !== 'order.json');
const order = files.length > 0 && existsSync(orderPath)
  ? JSON.parse(readFileSync(orderPath, 'utf8')) as string[]
  : files.map(name => name.replace(/\.json$/, '')).sort();
const agencies = order.map(slug => JSON.parse(readFileSync(resolve(sourceDir, `${slug}.json`), 'utf8')));

if (agencies.length === 0) throw new Error('No agency source files found');
const slugs = new Set<string>();
for (const agency of agencies) {
  if (!agency.slug || slugs.has(agency.slug)) throw new Error(`Invalid or duplicate agency slug: ${agency.slug}`);
  slugs.add(agency.slug);
}

const json = JSON.stringify({ agencies }, null, 2).replace(/[\u007f-\uffff]/g, char =>
  `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
);
writeFileSync(outputPath, `${json}\n`);
console.log(`Generated ${outputPath} from ${agencies.length} agency files`);
