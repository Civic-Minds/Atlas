/**
 * Read-only audit of agency feed URLs.
 *
 * Flags URLs that cannot keep up with new schedules:
 *  - the retired Google-hosted MobilityDatabase mirror (frozen since 2026-06-04, #627)
 *  - dated MobilityDatabase snapshots (pinned to one publish, #629)
 * and lists agencies on direct (non-MDB) URLs. With MDB_REFRESH_TOKEN set it
 * also lists exact provider-name matches in the MDB catalog as leads to verify
 * by hand. It never suggests the frozen mirror and never auto-picks a match.
 *
 * Run: npx tsx pipeline/audit-feed-urls.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import './loadEnv.js';
import { isDatedMobilityDatabaseSnapshot, isRetiredMobilityDatabaseMirror } from './feedSourceCandidates.js';

const MDB_API = 'https://api.mobilitydatabase.org/v1';

interface Agency {
  slug: string;
  name: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
}

interface MdbFeed {
  id: string;
  provider: string;
  status?: string;
}

export type FeedUrlKind = 'retired-mirror' | 'dated-snapshot' | 'mdb-stable' | 'direct';

export function classifyFeedUrl(url: string): FeedUrlKind {
  if (isRetiredMobilityDatabaseMirror(url)) return 'retired-mirror';
  if (isDatedMobilityDatabaseSnapshot(url)) return 'dated-snapshot';
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'mobilitydatabase.org' || host.endsWith('.mobilitydatabase.org')) return 'mdb-stable';
  } catch {
    // Unparseable URLs are treated as direct so they still get a look.
  }
  return 'direct';
}

export function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getMdbToken(refreshToken: string): Promise<string> {
  const res = await fetch(`${MDB_API}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) throw new Error(`MDB token exchange failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function fetchAllMdbFeeds(token: string): Promise<MdbFeed[]> {
  const all: MdbFeed[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const res = await fetch(`${MDB_API}/gtfs_feeds?limit=${limit}&offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`MDB feed list failed: ${res.status}`);
    const page = (await res.json()) as MdbFeed[];
    all.push(...page);
    if (page.length < limit) break;
  }
  return all;
}

async function main() {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/index.json'), 'utf8'));
  const agencies: Agency[] = Array.isArray(raw) ? raw : raw.agencies ?? [];

  const flagged: Array<{ slug: string; field: string; kind: FeedUrlKind; url: string }> = [];
  const direct: Agency[] = [];
  for (const agency of agencies) {
    for (const field of ['feedUrl', 'mdbFeedUrl'] as const) {
      const url = agency[field];
      if (!url) continue;
      const kind = classifyFeedUrl(url);
      if (kind === 'retired-mirror' || kind === 'dated-snapshot') flagged.push({ slug: agency.slug, field, kind, url });
    }
    if (agency.feedUrl && classifyFeedUrl(agency.feedUrl) === 'direct') direct.push(agency);
  }

  for (const kind of ['retired-mirror', 'dated-snapshot'] as const) {
    const rows = flagged.filter(row => row.kind === kind);
    console.log(`\n=== ${kind.toUpperCase()} (${rows.length}) ===`);
    for (const row of rows) console.log(`  ${row.slug} ${row.field}: ${row.url}`);
  }

  console.log(`\n=== DIRECT FEED URLS (${direct.length}) ===`);
  const refreshToken = process.env.MDB_REFRESH_TOKEN;
  if (!refreshToken) {
    for (const agency of direct) console.log(`  ${agency.slug}: ${agency.feedUrl}`);
    console.log('\n(Set MDB_REFRESH_TOKEN in .env.local to list exact MDB catalog name matches.)');
    return;
  }
  const feeds = await fetchAllMdbFeeds(await getMdbToken(refreshToken));
  const byProvider = new Map<string, MdbFeed[]>();
  for (const feed of feeds) {
    const key = normalizeProviderName(feed.provider);
    byProvider.set(key, [...(byProvider.get(key) ?? []), feed]);
  }
  for (const agency of direct) {
    const matches = byProvider.get(normalizeProviderName(agency.name)) ?? [];
    const lead = matches.length ? `  [exact name match, verify: ${matches.map(feed => `${feed.id}${feed.status ? ` (${feed.status})` : ''}`).join(', ')}]` : '';
    console.log(`  ${agency.slug}: ${agency.feedUrl}${lead}`);
  }
}

if (process.argv[1]?.endsWith('audit-feed-urls.ts')) {
  main().catch(e => { console.error(e); process.exit(1); });
}
