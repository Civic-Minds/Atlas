#!/usr/bin/env npx tsx
/**
 * validate-index.ts — basic structural validation for public/data/index.json
 * Run: npm run validate-index
 * Enforces:
 * - required fields
 * - no legacy stored artifact URLs (now derived)
 * - slug format
 * - center/bbox shapes
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const indexPath = resolve('public/data/index.json');
const raw = JSON.parse(readFileSync(indexPath, 'utf8'));
const agencies = raw.agencies || [];

let errors = 0;

function fail(msg: string, slug?: string) {
  console.error(`  ${slug ? slug + ': ' : ''}${msg}`);
  errors++;
}

agencies.forEach((a: any, i: number) => {
  const slug = a.slug || `#${i}`;
  if (!a.slug || typeof a.slug !== 'string' || !/^[a-z0-9-]+$/.test(a.slug)) {
    fail('invalid slug format', slug);
  }
  if (!a.name || typeof a.name !== 'string') fail('missing/invalid name', slug);
  if (!Array.isArray(a.center) || a.center.length !== 2 || a.center.some((n: any) => typeof n !== 'number')) {
    fail('invalid center [lat, lon]', slug);
  }
  if (a.bbox && (!Array.isArray(a.bbox) || a.bbox.length !== 4 || a.bbox.some((n: any) => typeof n !== 'number'))) {
    fail('invalid bbox [s,w,n,e]', slug);
  }
  if (!('feedUrl' in a) || (a.feedUrl !== null && typeof a.feedUrl !== 'string')) {
    fail('missing or invalid feedUrl (use null if none)', slug);
  }
  // Enforce derivation: no stored R2 artifact URLs
  if (a.url || a.stopsUrl || a.corridorsUrl) {
    fail('artifact URLs must not be stored (derive via getAgencyArtifactUrls)', slug);
  }
  if (a.supplementalFeedUrls && !Array.isArray(a.supplementalFeedUrls)) {
    fail('supplementalFeedUrls must be array', slug);
  }
});

if (errors) {
  console.error(`\nValidation failed with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`✓ index.json valid (${agencies.length} agencies, artifacts derived)`);
}
