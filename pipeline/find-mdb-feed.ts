#!/usr/bin/env npx tsx
/**
 * find-mdb-feed.ts — search Mobility Database for a GTFS feed by name/city/provider.
 * Prints the best current hosted URL (for feedUrl) + a suggested mdbFeedUrl (legacy GCS if available)
 * and a ready-to-paste snippet for public/data/index.json (artifact URLs are derived).
 *
 * Usage:
 *   npx tsx pipeline/find-mdb-feed.ts "Philadelphia" septa "39.95,-75.16"
 *   npx tsx pipeline/find-mdb-feed.ts "Denver RTD" rtd-denver "39.74,-104.99"
 *
 * Requires MDB_REFRESH_TOKEN in .env.local (same as audit-feed-urls.ts).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const MDB_API = 'https://api.mobilitydatabase.org/v1';

interface MdbFeed {
  id: string;
  provider: string;
  feed_name?: string;
  locations?: { country_code?: string; subdivision_name?: string; municipality?: string }[];
  latest_dataset?: { hosted_url?: string; downloaded_at?: string };
}

async function getMdbToken(): Promise<string> {
  const refreshToken = process.env.MDB_REFRESH_TOKEN;
  if (!refreshToken) throw new Error('Missing MDB_REFRESH_TOKEN in .env.local');
  const res = await fetch(`${MDB_API}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`MDB token exchange failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

async function searchFeeds(token: string, query: string): Promise<MdbFeed[]> {
  const all: MdbFeed[] = [];
  let offset = 0;
  const limit = 100;
  const q = query.toLowerCase();
  while (true) {
    const res = await fetch(
      `${MDB_API}/gtfs_feeds?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`MDB feed list failed: ${res.status}`);
    const page = await res.json() as MdbFeed[];
    if (!page.length) break;
    const matches = page.filter(f =>
      (f.provider || '').toLowerCase().includes(q) ||
      (f.feed_name || '').toLowerCase().includes(q) ||
      (f.locations || []).some(l =>
        (l.municipality || '').toLowerCase().includes(q) ||
        (l.subdivision_name || '').toLowerCase().includes(q)
      )
    );
    all.push(...matches);
    if (page.length < limit) break;
    offset += limit;
  }
  return all;
}

function toMdbLatestStyle(hosted: string | undefined): string | null {
  if (!hosted) return null;
  // Try to map files.mobility.../mdb-XXX/... or similar to legacy GCS if pattern matches numeric id at end
  const m = hosted.match(/mdb-(\d+)[^/]*\.zip/);
  if (m) {
    // We don't have a perfect mapping; the audit script + GCS listing is the source of truth for legacy names.
    // For now return null so caller can fall back.
  }
  return null;
}

async function main() {
  const searchTerm = process.argv[2];
  const slug = process.argv[3];
  const center = process.argv[4] || 'lat,lon';

  if (!searchTerm) {
    console.error('Usage: npx tsx pipeline/find-mdb-feed.ts "search term" <slug> [lat,lon]');
    console.error('Example: npx tsx pipeline/find-mdb-feed.ts "SEPTA" septa "39.9526,-75.1652"');
    process.exit(1);
  }

  console.log(`\nSearching Mobility Database for "${searchTerm}"...\n`);
  const token = await getMdbToken();
  const matches = await searchFeeds(token, searchTerm);

  if (matches.length === 0) {
    console.log('No matches found. Try a broader term (city, "Transit", agency name).');
    return;
  }

  console.log(`Found ${matches.length} match(es):\n`);

  for (const m of matches.slice(0, 5)) {
    const hosted = m.latest_dataset?.hosted_url;
    const legacy = toMdbLatestStyle(hosted); // placeholder
    console.log(`Provider: ${m.provider}`);
    console.log(`  Feed name: ${m.feed_name || '(none)'}`);
    console.log(`  Locations: ${(m.locations || []).map(l => [l.municipality, l.subdivision_name].filter(Boolean).join(', ')).join(' | ')}`);
    console.log(`  Current hosted (MDB): ${hosted || '(none)'}`);
    console.log(`  Suggested feedUrl (use this): ${hosted || 'https://storage.googleapis.com/storage/v1/b/mdb-latest/o/REPLACE-WITH-ID.zip?alt=media'}`);
    console.log('');
  }

  const best = matches[0];
  const bestHosted = best.latest_dataset?.hosted_url || '';

  console.log('--- Suggested index.json snippet (edit bbox/region as needed) ---');
  console.log(JSON.stringify({
    slug,
    name: best.provider,
    region: (best.locations?.[0]?.subdivision_name) || 'TODO',
    center: center.split(',').map(Number),
    bbox: [0,0,0,0], // compute after first process or approximate
    feedUrl: bestHosted || 'TODO-mdb-latest',
    mdbFeedUrl: bestHosted || 'TODO',
    lastFeedExpiry: null,
    lastFeedVersion: null
  }, null, 2));
  console.log('\n(Artifact urls like url/stopsUrl/corridorsUrl are derived — do not include them.)');

  console.log('\nNext steps:');
  console.log(`  npm run process -- "${bestHosted}" ${slug} "..." "${center}"`);
  console.log(`  # then edit public/data/index.json with the snippet above + real bbox`);
  console.log(`  npm run refresh -- ${slug} --force`);
}

main().catch(e => { console.error(e); process.exit(1); });
