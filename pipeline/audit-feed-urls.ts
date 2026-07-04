/**
 * Audits agencies whose feedUrl is *not* from Mobility Database.
 * Recognizes both legacy GCS mdb-latest mirrors and current files.mobilitydatabase.org.
 * Suggests stable mdb-latest mirrors for true direct/official feeds.
 *
 * Run: npx tsx pipeline/audit-feed-urls.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

const MDB_API = 'https://api.mobilitydatabase.org/v1';
const GCS_BASE = 'https://storage.googleapis.com/storage/v1/b/mdb-latest/o';
const GCS_DOWNLOAD = 'https://storage.googleapis.com/storage/v1/b/mdb-latest/o';

interface Agency {
  slug: string;
  name: string;
  feedUrl?: string | null;
  region?: string;
}

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

async function fetchAllMdbFeeds(token: string): Promise<MdbFeed[]> {
  const all: MdbFeed[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(
      `${MDB_API}/gtfs_feeds?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`MDB feed list failed: ${res.status}`);
    const page = await res.json() as MdbFeed[];
    if (!page.length) break;
    all.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }
  return all;
}

// Extract the GCS object name from a hosted_url like
// "https://storage.googleapis.com/mdb-latest/ca-ontario-go-transit-gtfs-1993.zip"
function hostedUrlToFeedId(url: string): string | null {
  const m = url.match(/mdb-latest\/([^?]+\.zip)/);
  return m ? m[1].replace(/\.zip$/, '') : null;
}

function mdbDownloadUrl(feedId: string): string {
  return `${GCS_DOWNLOAD}/${feedId}.zip?alt=media`;
}

async function main() {
  const indexPath = resolve(process.cwd(), 'public/data/index.json');
  const raw = JSON.parse(readFileSync(indexPath, 'utf8'));
  const agencies: Agency[] = Array.isArray(raw) ? raw : raw.agencies ?? [];

  const nonMdb = agencies.filter(
    a => a.feedUrl && !a.feedUrl.includes('mdb-latest') && !a.feedUrl.includes('mobilitydatabase.org')
  );

  console.log(`\nAuditing ${nonMdb.length} agencies on direct feed URLs...\n`);

  console.log('Fetching MDB catalog...');
  const token = await getMdbToken();
  const allFeeds = await fetchAllMdbFeeds(token);
  console.log(`Loaded ${allFeeds.length} feeds from MDB.\n`);

  // Build lookup: normalize provider name → feeds
  // Also index by hosted_url feed ID so we can do fast GCS lookups
  const feedsByProvider = new Map<string, MdbFeed[]>();
  for (const feed of allFeeds) {
    const key = feed.provider.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!feedsByProvider.has(key)) feedsByProvider.set(key, []);
    feedsByProvider.get(key)!.push(feed);
  }

  // GCS bucket listing — get all object names once for slug-based matching
  console.log('Fetching GCS mdb-latest object list...');
  const gcsRes = await fetch(`${GCS_BASE}?maxResults=3000`);
  const gcsData = await gcsRes.json() as { items?: { name: string }[]; nextPageToken?: string };
  const gcsObjects = new Set((gcsData.items ?? []).map(i => i.name));
  // Fetch page 2 if needed
  if (gcsData.nextPageToken) {
    const gcsRes2 = await fetch(`${GCS_BASE}?maxResults=3000&pageToken=${gcsData.nextPageToken}`);
    const gcsData2 = await gcsRes2.json() as { items?: { name: string }[] };
    for (const i of gcsData2.items ?? []) gcsObjects.add(i.name);
  }
  console.log(`GCS bucket has ${gcsObjects.size} objects.\n`);

  // For each agency, find candidate MDB feeds by matching against the GCS object names
  // using slug fragments and agency name fragments.
  const results: { slug: string; name: string; current: string; suggested: string | null; confidence: 'high' | 'low' }[] = [];

  for (const agency of nonMdb) {
    const slugParts = agency.slug.replace(/-/g, '');
    const nameParts = agency.name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Find GCS objects that contain the slug or significant name parts
    const candidates = [...gcsObjects].filter(obj => {
      const o = obj.toLowerCase();
      return o.includes(slugParts) || (nameParts.length >= 4 && o.includes(nameParts));
    });

    if (candidates.length === 1) {
      const feedId = candidates[0].replace(/\.zip$/, '');
      results.push({ slug: agency.slug, name: agency.name, current: agency.feedUrl!, suggested: mdbDownloadUrl(feedId), confidence: 'high' });
    } else if (candidates.length > 1) {
      // Multiple matches — pick the shortest (most specific)
      candidates.sort((a, b) => a.length - b.length);
      const feedId = candidates[0].replace(/\.zip$/, '');
      results.push({ slug: agency.slug, name: agency.name, current: agency.feedUrl!, suggested: mdbDownloadUrl(feedId), confidence: 'low' });
    } else {
      results.push({ slug: agency.slug, name: agency.name, current: agency.feedUrl!, suggested: null, confidence: 'low' });
    }
  }

  const found = results.filter(r => r.suggested);
  const notFound = results.filter(r => !r.suggested);
  const highConf = found.filter(r => r.confidence === 'high');
  const lowConf = found.filter(r => r.confidence === 'low');

  console.log(`=== HIGH CONFIDENCE MATCHES (${highConf.length}) ===`);
  for (const r of highConf) {
    console.log(`\n  ${r.slug} (${r.name})`);
    console.log(`    current:   ${r.current}`);
    console.log(`    suggested: ${r.suggested}`);
  }

  console.log(`\n=== LOW CONFIDENCE MATCHES (${lowConf.length}) — verify before swapping ===`);
  for (const r of lowConf) {
    console.log(`\n  ${r.slug} (${r.name})`);
    console.log(`    current:   ${r.current}`);
    console.log(`    suggested: ${r.suggested}`);
  }

  console.log(`\n=== NO MDB MATCH FOUND (${notFound.length}) ===`);
  for (const r of notFound) {
    console.log(`  ${r.slug}: ${r.current}`);
  }

  console.log(`\nSummary: ${found.length}/${nonMdb.length} agencies have MDB mirrors (${highConf.length} high confidence, ${lowConf.length} low confidence).`);
}

main().catch(e => { console.error(e); process.exit(1); });
