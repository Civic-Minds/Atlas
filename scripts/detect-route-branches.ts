/**
 * Diagnostic-only: scan every agency's live feed for route branching --
 * a trunk route that splits into multiple named endpoints/corridors.
 *
 * Detects three real-world encodings seen across agencies already in Atlas:
 *   - letter-suffix route_ids sharing a numeric base   (GRTC: 1, 1A, 1B, 1C)
 *   - letter-suffix route_ids sharing a word base       (YRT VIVA: purple, purple A)
 *   - one route_id, branch only distinguishable by headsign (Ride On Flash, TransLink Canada Line)
 *
 * Every candidate is confirmed against actual stop IDs (which stops each side serves, in
 * order) before being reported, to filter out coincidental naming and cosmetic headsign
 * variants of the same path.
 *
 * Read-only: does not touch R2, the pipeline, or any committed data. Writes a JSON report to
 * tmp/route-branch-report.json.
 *
 * Usage:
 *   npx tsx scripts/detect-route-branches.ts            # all agencies with a feedUrl
 *   npx tsx scripts/detect-route-branches.ts grtc yrt    # specific slugs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import type { GtfsData } from '../types/gtfs';

interface AgencyEntry {
  slug: string;
  name: string;
  feedUrl?: string | null;
  mdbFeedUrl?: string | null;
}

interface BranchCandidate {
  kind: 'letter-suffix' | 'headsign';
  /** 'branch' = genuinely different paths after a split point. 'short-turn' = the shorter one is just an early-ending version of the same path (not a different destination). */
  pattern: 'branch' | 'short-turn';
  base: string;
  members: string[];
  /** Number of stops the two sides genuinely share (not a fraction) -- how substantial the common trunk is. */
  sharedStops: number;
  detail: string;
  /** Smallest member's share of trips among the flagged members, e.g. 0.5 = a real 50/50 fork, 0.1 = a rare tail case. */
  minorShare?: number;
}

/**
 * Walks `a` against `b` in order (greedy, forward-only -- a matched stop in `b` can't be
 * matched again by an earlier position), counting how many of `a`'s stops never appear ahead
 * of the last match, and how many do. `sharedCount` from `a`'s walk is the real trunk length;
 * `uniqueA`/`uniqueB` are how much routing each side has that the other doesn't.
 */
function compareStopSeqs(a: string[], b: string[]): { uniqueA: number; uniqueB: number; sharedCount: number } {
  let j = 0, uniqueA = 0, sharedCount = 0;
  for (const stop of a) {
    let found = -1;
    for (let k = j; k < b.length; k++) if (b[k] === stop) { found = k; break; }
    if (found === -1) uniqueA++; else { j = found + 1; sharedCount++; }
  }
  let j2 = 0, uniqueB = 0;
  for (const stop of b) {
    let found = -1;
    for (let k = j2; k < a.length; k++) if (a[k] === stop) { found = k; break; }
    if (found === -1) uniqueB++; else j2 = found + 1;
  }
  return { uniqueA, uniqueB, sharedCount };
}

/**
 * At least 3 shared stops. A loop route's start/end terminal is visited twice in one trip
 * (once at departure, once on return), which the ordered walk can match twice even when
 * that's the only stop the two sides actually have in common -- Belleville's 5A/5B share
 * exactly one real stop (their common terminal) but scored 2 "shared" before this, since
 * that terminal appears at both ends of each trip. 3 rules out a single repeated terminal
 * while every confirmed real case stays comfortably above it (all in the double digits).
 */
const MIN_SHARED_STOPS = 3;

/**
 * A branch has routing each side doesn't share -- GRTC's 1A and 1B both go somewhere the
 * other never does. A short-turn has no unique routing at all on the shorter side -- GO
 * Transit's Meadowvale trip is entirely a subset of the Milton trip's stops, just cut off
 * partway. Checked directly against stop IDs (exact) rather than map coordinates (two GTFS
 * shapes for the same real road are often hand-drawn slightly differently even when
 * identical -- confirmed on GO 27, a real short-turn that only showed 36-76% coordinate
 * overlap even with a generous match radius). No slack: on LIRR, Grand Central vs Penn
 * Station differs by exactly one stop on the Grand Central side (the terminal itself) --
 * that one stop is the entire point of the branch, not noise to forgive.
 */
function classifyPatternByStops(stopsA: string[], stopsB: string[]): { pattern: 'branch' | 'short-turn'; sharedCount: number } | null {
  const { uniqueA, uniqueB, sharedCount } = compareStopSeqs(stopsA, stopsB);
  if (sharedCount < MIN_SHARED_STOPS) return null; // not a real common trunk -- unrelated or mismatched direction
  if (uniqueA === 0 && uniqueB === 0) return null; // identical routing, nothing to report
  return { pattern: uniqueA > 0 && uniqueB > 0 ? 'branch' : 'short-turn', sharedCount };
}

function buildStopSeqIndex(gtfs: GtfsData): Map<string, string[]> {
  const byTrip = new Map<string, { seq: number; stop: string }[]>();
  for (const st of gtfs.stopTimes ?? []) {
    const seq = parseInt(st.stop_sequence);
    if (Number.isNaN(seq)) continue;
    if (!byTrip.has(st.trip_id)) byTrip.set(st.trip_id, []);
    byTrip.get(st.trip_id)!.push({ seq, stop: st.stop_id });
  }
  const result = new Map<string, string[]>();
  for (const [tripId, entries] of byTrip) {
    entries.sort((a, b) => a.seq - b.seq);
    result.set(tripId, entries.map(e => e.stop));
  }
  return result;
}

/**
 * Keyed by route_id AND direction, not just route_id. Picking "the longest trip" per route_id
 * without regard to direction picks whichever direction happens to be longest independently
 * per route -- for GRTC this meant route 1's pick ran suburb-to-downtown while 1A's pick ran
 * downtown-to-suburb, so comparing their stop lists found almost no overlap even though they
 * share the same downtown terminal. Comparing same-direction trips only avoids that.
 */
function groupTripsByRouteDir(gtfs: GtfsData): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of gtfs.trips) {
    const key = `${t.route_id}::${t.direction_id?.trim() ?? ''}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(t.trip_id);
  }
  return out;
}

function directionsForRoute(gtfs: GtfsData, routeId: string): Set<string> {
  const out = new Set<string>();
  for (const t of gtfs.trips) {
    if (t.route_id === routeId) out.add(t.direction_id?.trim() ?? '');
  }
  return out;
}

function groupTripsByRouteHeadsign(gtfs: GtfsData): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const t of gtfs.trips) {
    const hs = t.trip_headsign?.trim();
    if (!hs) continue;
    const key = `${t.route_id}::${hs}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(t.trip_id);
  }
  return out;
}

/** The stop sequence used by the most trips -- not the longest one, which can be a rarely-used
 *  detour/extension that doesn't represent what most riders actually experience (same failure
 *  mode documented for shape length in shape-selection.ts's STAR Rennes 77 comment). */
function modalStopSeq(tripIds: string[], stopSeqIndex: Map<string, string[]>): string[] | null {
  const counts = new Map<string, { seq: string[]; count: number }>();
  for (const tid of tripIds) {
    const seq = stopSeqIndex.get(tid);
    if (!seq || seq.length === 0) continue;
    const key = seq.join('|');
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { seq, count: 1 });
  }
  let best: { seq: string[]; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.seq ?? null;
}

function baseAndLetter(shortName: string): { base: string; letter: string } | null {
  const tight = shortName.match(/^(\d+)([A-Za-z])$/);
  if (tight) return { base: tight[1], letter: tight[2].toUpperCase() };
  const spaced = shortName.match(/^([A-Za-z][A-Za-z\s]*?)\s+([A-Za-z])$/);
  if (spaced) return { base: spaced[1].toLowerCase(), letter: spaced[2].toUpperCase() };
  return null;
}

function detectLetterSuffixCandidates(
  gtfs: GtfsData,
  stopSeqIndex: Map<string, string[]>,
  tripsByRouteDir: Map<string, string[]>,
): BranchCandidate[] {
  const groups = new Map<string, { shortName: string; routeId: string }[]>();
  for (const route of gtfs.routes) {
    const sn = route.route_short_name?.trim();
    if (!sn) continue;
    const parsed = baseAndLetter(sn);
    if (!parsed) continue;
    const key = parsed.base;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ shortName: sn, routeId: route.route_id });
  }

  const out: BranchCandidate[] = [];
  for (const [base, members] of groups) {
    if (members.length < 2) continue;
    let bestShared = 0;
    let anyRelated = false;
    let groupPattern: 'branch' | 'short-turn' = 'short-turn';
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        // Compare same-direction trips only -- "the longest trip per route" can pick opposite
        // travel directions for different route_ids, which fails to line up even when they
        // share a real terminal (see groupTripsByRouteDir's comment).
        const dirsA = directionsForRoute(gtfs, members[i].routeId);
        const dirsB = directionsForRoute(gtfs, members[j].routeId);
        const commonDirs = [...dirsA].filter(d => dirsB.has(d));
        for (const dir of commonDirs) {
          const stopsA = modalStopSeq(tripsByRouteDir.get(`${members[i].routeId}::${dir}`) ?? [], stopSeqIndex);
          const stopsB = modalStopSeq(tripsByRouteDir.get(`${members[j].routeId}::${dir}`) ?? [], stopSeqIndex);
          if (!stopsA || !stopsB) continue;
          const result = classifyPatternByStops(stopsA, stopsB);
          if (!result) continue;
          anyRelated = true;
          bestShared = Math.max(bestShared, result.sharedCount);
          if (result.pattern === 'branch') groupPattern = 'branch';
        }
      }
    }
    if (anyRelated) {
      out.push({
        kind: 'letter-suffix',
        pattern: groupPattern,
        base,
        members: members.map(m => m.shortName).sort(),
        sharedStops: bestShared,
        detail: `${members.length} route_ids share base "${base}"`,
      });
    }
  }
  return out;
}

function detectHeadsignCandidates(
  gtfs: GtfsData,
  stopSeqIndex: Map<string, string[]>,
  tripsByRouteHeadsign: Map<string, string[]>,
): BranchCandidate[] {
  const routeById = new Map(gtfs.routes.map(r => [r.route_id, r]));
  const byRouteDir = new Map<string, { headsign: string; count: number }[]>();
  const counters = new Map<string, Map<string, number>>();

  for (const trip of gtfs.trips) {
    const hs = trip.trip_headsign?.trim();
    if (!hs) continue;
    const key = `${trip.route_id}::${trip.direction_id?.trim() ?? ''}`;
    if (!counters.has(key)) counters.set(key, new Map());
    const m = counters.get(key)!;
    m.set(hs, (m.get(hs) ?? 0) + 1);
  }
  for (const [key, m] of counters) {
    byRouteDir.set(key, [...m.entries()].map(([headsign, count]) => ({ headsign, count })));
  }

  const out: BranchCandidate[] = [];
  for (const [key, headsigns] of byRouteDir) {
    if (headsigns.length < 2) continue;
    const total = headsigns.reduce((s, h) => s + h.count, 0);
    // Only headsigns carrying a real share of trips -- drops rare short-turns/anomalies.
    const substantial = headsigns.filter(h => h.count / total >= 0.15 && h.count >= 5);
    if (substantial.length < 2) continue;

    const [routeId] = key.split('::');
    const route = routeById.get(routeId);
    const sn = route?.route_short_name || routeId;

    let bestShared = 0;
    let anyRelated = false;
    let groupPattern: 'branch' | 'short-turn' = 'short-turn';
    for (let i = 0; i < substantial.length; i++) {
      for (let j = i + 1; j < substantial.length; j++) {
        const key1 = `${routeId}::${substantial[i].headsign}`;
        const key2 = `${routeId}::${substantial[j].headsign}`;
        const stopsA = modalStopSeq(tripsByRouteHeadsign.get(key1) ?? [], stopSeqIndex);
        const stopsB = modalStopSeq(tripsByRouteHeadsign.get(key2) ?? [], stopSeqIndex);
        if (!stopsA || !stopsB) continue;
        const result = classifyPatternByStops(stopsA, stopsB);
        if (!result) continue;
        anyRelated = true;
        bestShared = Math.max(bestShared, result.sharedCount);
        if (result.pattern === 'branch') groupPattern = 'branch';
      }
    }
    if (!anyRelated) continue; // no real shared trunk -- e.g. outbound/inbound pair, not a branch

    const minorShare = Math.min(...substantial.map(h => h.count / total));

    out.push({
      kind: 'headsign',
      pattern: groupPattern,
      base: String(sn),
      members: substantial.map(h => h.headsign).sort(),
      sharedStops: bestShared,
      detail: `route_id ${routeId}, ${substantial.length} substantial headsigns`,
      minorShare: Math.round(minorShare * 100) / 100,
    });
  }
  return out;
}

async function loadGtfs(agency: AgencyEntry): Promise<GtfsData> {
  const url = agency.feedUrl || agency.mdbFeedUrl;
  if (!url) throw new Error('no feedUrl');
  const res = await fetch(url, { headers: { 'User-Agent': 'atlas-frequency-map/1.0' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
}

async function main() {
  const args = process.argv.slice(2);
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: AgencyEntry[] };
  const agencies = args.length
    ? index.agencies.filter(a => args.includes(a.slug))
    : index.agencies.filter(a => a.feedUrl || a.mdbFeedUrl);

  const queue = [...agencies];
  const report: Record<string, BranchCandidate[]> = {};
  const errors: Record<string, string> = {};
  let done = 0;
  const concurrency = 2;

  async function worker() {
    while (queue.length) {
      const agency = queue.shift();
      if (!agency) return;
      try {
        const gtfs = await loadGtfs(agency);
        const stopSeqIndex = buildStopSeqIndex(gtfs);
        const tripsByRouteDir = groupTripsByRouteDir(gtfs);
        const tripsByRouteHeadsign = groupTripsByRouteHeadsign(gtfs);
        const candidates = [
          ...detectLetterSuffixCandidates(gtfs, stopSeqIndex, tripsByRouteDir),
          ...detectHeadsignCandidates(gtfs, stopSeqIndex, tripsByRouteHeadsign),
        ];
        if (candidates.length) report[agency.slug] = candidates;
      } catch (err) {
        errors[agency.slug] = err instanceof Error ? err.message : String(err);
      }
      done++;
      process.stdout.write(`\rScanned ${done}/${agencies.length}`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log('\n');

  const slugs = Object.keys(report).sort();
  console.log(`Agencies with confirmed branch candidates: ${slugs.length} / ${agencies.length}\n`);
  for (const slug of slugs) {
    console.log(`=== ${slug} ===`);
    for (const c of report[slug]) {
      console.log(`  [${c.kind}/${c.pattern}] ${c.base}: ${c.members.join(', ')}  (${c.sharedStops} shared stops)`);
    }
  }

  const errorSlugs = Object.keys(errors);
  console.log(`\n${errorSlugs.length} agencies failed to load/parse (network/format issues, not branch-related).`);

  mkdirSync(resolve('tmp'), { recursive: true });
  const outPath = resolve('tmp/route-branch-report.json');
  writeFileSync(outPath, JSON.stringify({ report, errors }, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main();
