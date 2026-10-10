/**
 * Release diff gate: compare every agency's new output with what is live
 * before anything is published, and refuse on red flags (#615, #616, #655, #658).
 *
 * Runs in refresh, reprocess-derived-artifacts --write and publish-data-release
 * (so also refresh-release) before any R2 write. Everything here is pure except
 * the report writer, so the rules can be tested without R2.
 *
 * Flags (see docs/operations/DATA_REPROCESSING.md § Release diff gate):
 *   red    drop          more than MAX_DROP_FRACTION of live routes, stops or stop points lost (the shared drop guard)
 *   red    empty         live had routes, the new output has none
 *   red    mode-lost     a mode present live (e.g. Commuter Rail) is missing from the new output
 *   red    duplicate     route output identical or near-identical to a different agency's
 *   red    headway-shift the weekday headway halves or doubles on a large share of the routes
 *   red    expired       the new output's service has already ended (output changed)
 *   yellow expired       service has ended, but the output is unchanged from live
 *   yellow headway-shift a smaller share of routes halves or doubles
 *   yellow future-start  service does not start until a future date
 *   yellow added         no live artifact to compare with (new to the release),
 *                        or the live one predates route schema v2; no diff is taken
 *
 * A red flag blocks only its own agency. `--allow <slug>:<flag>` accepts one
 * reviewed flag for one agency; `--allow-drop` keeps its old meaning (accept a
 * reviewed drop for every agency in the run).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getGtfsModeName } from '../shared/modes.js';
import { countArtifacts, dropGuardRefusal, type ArtifactCounts } from './archiveSelection.js';

export const GATE_FLAGS = ['drop', 'empty', 'mode-lost', 'duplicate', 'headway-shift', 'expired', 'future-start', 'added'] as const;
export type GateFlagName = typeof GATE_FLAGS[number];
export type GateLevel = 'red' | 'yellow';

export interface GateFlag {
  slug: string;
  flag: GateFlagName;
  level: GateLevel;
  message: string;
  /** True when a red flag was accepted with --allow / --allow-drop. */
  allowed?: boolean;
}

/** A route is "shifted" when its weekday headway at least doubles or halves. */
export const HEADWAY_SHIFT_RATIO = 2;
/** Red when at least this share of comparable routes shift. */
export const HEADWAY_SHIFT_RED_SHARE = 0.3;
/** Yellow when at least this share (and at least HEADWAY_SHIFT_MIN_SHIFTED routes) shift. */
export const HEADWAY_SHIFT_YELLOW_SHARE = 0.1;
/** Headway shifts are only judged with at least this many routes present in both. */
export const HEADWAY_SHIFT_MIN_ROUTES = 5;
export const HEADWAY_SHIFT_MIN_SHIFTED = 3;
/** Route-signature overlap (Jaccard) at or above which two agencies count as near-identical. */
export const DUPLICATE_SIMILARITY = 0.9;
/** Both agencies need at least this many routes before near-identity is judged. */
export const DUPLICATE_MIN_ROUTES = 3;

export interface ArtifactSummary {
  counts: ArtifactCounts;
  /** Top-level atlasSchemaVersion, or null for artifacts that predate it. */
  schemaVersion?: number | null;
  /** Mode labels (GTFS base types via shared/modes) present in the route lines. */
  modes: string[];
  /** sha256 of the route line features, ignoring top-level stamps. */
  contentHash: string;
  /** One `routeId|start|end` signature per distinct route line shape. */
  routeSignatures: string[];
  /** Median weekday headway per route, from the route lines' `headway`. */
  weekdayHeadways: Record<string, number>;
  /** Mean of the route line endpoints, [lon, lat], or null with no lines. */
  centroid: [number, number] | null;
}

export interface ServiceWindow {
  start?: string | null;
  end?: string | null;
}

interface LineFeature {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function lineEndpoints(geometry: LineFeature['geometry']): [number[], number[]] | null {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const line = (geometry?.type === 'MultiLineString' ? coords.flat() : coords) as number[][];
  const first = line[0];
  const last = line[line.length - 1];
  return Array.isArray(first) && Array.isArray(last) ? [first, last] : null;
}

const roundCoord = (point: number[]) => `${Number(point[0]).toFixed(3)},${Number(point[1]).toFixed(3)}`;

/** Summarize a route artifact (and its stops index) for the gate. */
export function summarizeArtifact(geojson: string, stopsJson: string | null): ArtifactSummary {
  const counts = countArtifacts(geojson, stopsJson);
  const parsed = JSON.parse(geojson) as { features?: LineFeature[]; atlasSchemaVersion?: unknown };
  const features = (parsed.features ?? [])
    .filter(f => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString');
  const modes = new Set<string>();
  const signatures = new Set<string>();
  const headways: Record<string, number[]> = {};
  let lonSum = 0;
  let latSum = 0;
  let points = 0;
  for (const feature of features) {
    const p = feature.properties ?? {};
    if (p.routeId == null) continue;
    const routeId = String(p.routeId);
    modes.add(getGtfsModeName(p.routeType == null || p.routeType === '' ? 3 : p.routeType as number));
    const ends = lineEndpoints(feature.geometry);
    if (ends) {
      signatures.add(`${routeId}|${roundCoord(ends[0])}|${roundCoord(ends[1])}`);
      for (const pt of ends) { lonSum += Number(pt[0]); latSum += Number(pt[1]); points++; }
    }
    const headway = Number(p.headway);
    if (p.day === 'Weekday' && p.headway != null && Number.isFinite(headway) && headway > 0) {
      (headways[routeId] ??= []).push(headway);
    }
  }
  return {
    counts,
    schemaVersion: typeof parsed.atlasSchemaVersion === 'number' ? parsed.atlasSchemaVersion : null,
    modes: [...modes].sort(),
    contentHash: createHash('sha256').update(JSON.stringify(features)).digest('hex'),
    routeSignatures: [...signatures].sort(),
    weekdayHeadways: Object.fromEntries(Object.entries(headways).map(([id, values]) => [id, median(values)])),
    centroid: points ? [lonSum / points, latSum / points] : null,
  };
}

const signatureSets = new WeakMap<ArtifactSummary, Set<string>>();

/** Jaccard similarity of two agencies' route signatures. */
export function routeSimilarity(a: ArtifactSummary, b: ArtifactSummary): number {
  if (!a.routeSignatures.length || !b.routeSignatures.length) return 0;
  let setB = signatureSets.get(b);
  if (!setB) { setB = new Set(b.routeSignatures); signatureSets.set(b, setB); }
  const shared = a.routeSignatures.filter(sig => setB.has(sig)).length;
  return shared / (a.routeSignatures.length + b.routeSignatures.length - shared);
}

export interface HeadwayShift {
  compared: number;
  shifted: string[];
}

export function headwayShift(live: ArtifactSummary, next: ArtifactSummary): HeadwayShift {
  const shifted: string[] = [];
  let compared = 0;
  for (const [routeId, before] of Object.entries(live.weekdayHeadways)) {
    const after = next.weekdayHeadways[routeId];
    if (after == null) continue;
    compared++;
    if (after >= before * HEADWAY_SHIFT_RATIO || after * HEADWAY_SHIFT_RATIO <= before) shifted.push(routeId);
  }
  return { compared, shifted: shifted.sort() };
}

export interface AgencyGateInput {
  slug: string;
  /** Live summary, or null when no live artifact could be read. */
  live: ArtifactSummary | null;
  next: ArtifactSummary;
  service?: ServiceWindow;
  /** Reprocess refuses agencies with no readable live artifact; refresh and publish allow them. */
  allowMissingLive: boolean;
}

export interface GatePeer {
  slug: string;
  summary: ArtifactSummary;
}

const flag = (slug: string, name: GateFlagName, level: GateLevel, message: string): GateFlag => ({ slug, flag: name, level, message });

/**
 * Flags for one agency. `peers` are other agencies' summaries as they will be
 * after this publish (their new output when it is in the same run, otherwise
 * what is live).
 */
export function evaluateAgency(input: AgencyGateInput, peers: GatePeer[], todayYmd: string): GateFlag[] {
  const { slug, next } = input;
  const flags: GateFlag[] = [];

  // New to the release (no live artifact where missing live is allowed), or a
  // live artifact from before route schema v2: report it as added and skip
  // the before/after diff, which would compare against nothing or stale data.
  const legacyLive = !!input.live && input.live.schemaVersion == null && next.schemaVersion != null;
  if ((!input.live && input.allowMissingLive) || legacyLive) {
    flags.push(flag(slug, 'added', 'yellow', legacyLive
      ? 'live artifact predates route schema v2; treated as new, no before/after diff'
      : 'no live artifact to compare with (new to this release); no before/after diff'));
  }
  const live = legacyLive ? null : input.live;

  // The drop guard shared with refresh and reprocess since #628/#657.
  const drop = dropGuardRefusal(live?.counts ?? null, next.counts, { allowDrop: false, allowMissingLive: input.allowMissingLive || legacyLive });
  if (drop) flags.push(flag(slug, 'drop', 'red', drop));

  if (live && live.counts.routes > 0 && next.counts.routes === 0) {
    flags.push(flag(slug, 'empty', 'red', `live has ${live.counts.routes} routes, the new output has none`));
  }

  if (live) {
    const lost = live.modes.filter(mode => !next.modes.includes(mode));
    if (lost.length && next.counts.routes > 0) {
      flags.push(flag(slug, 'mode-lost', 'red', `loses ${lost.join(', ')} (live ${live.modes.join(', ')}; new ${next.modes.join(', ') || 'none'})`));
    }

    const shift = headwayShift(live, next);
    if (shift.compared >= HEADWAY_SHIFT_MIN_ROUTES && shift.shifted.length >= HEADWAY_SHIFT_MIN_SHIFTED) {
      const share = shift.shifted.length / shift.compared;
      const level: GateLevel | null = share >= HEADWAY_SHIFT_RED_SHARE ? 'red' : share >= HEADWAY_SHIFT_YELLOW_SHARE ? 'yellow' : null;
      if (level) {
        const examples = shift.shifted.slice(0, 6).map(id => `${id} ${live.weekdayHeadways[id]}->${next.weekdayHeadways[id]} min`).join(', ');
        flags.push(flag(slug, 'headway-shift', level,
          `${shift.shifted.length} of ${shift.compared} routes' weekday headway halves or doubles (${Math.round(share * 100)}%; ${examples}${shift.shifted.length > 6 ? ', ...' : ''})`));
      }
    }
  }

  for (const peer of peers) {
    if (peer.slug === slug || next.counts.routes === 0) continue;
    if (peer.summary.contentHash === next.contentHash) {
      flags.push(flag(slug, 'duplicate', 'red', `route output is identical to ${peer.slug}`));
      continue;
    }
    const [small, large] = [next.routeSignatures.length, peer.summary.routeSignatures.length].sort((a, b) => a - b);
    if (small < DUPLICATE_MIN_ROUTES || small / large < DUPLICATE_SIMILARITY) continue;
    const similarity = routeSimilarity(next, peer.summary);
    if (similarity >= DUPLICATE_SIMILARITY) {
      flags.push(flag(slug, 'duplicate', 'red', `route output is ${Math.round(similarity * 100)}% the same as ${peer.slug} (route IDs and shape endpoints)`));
    }
  }

  const end = input.service?.end ?? null;
  if (end && /^\d{8}$/.test(end) && end < todayYmd) {
    const unchanged = !!live && live.contentHash === next.contentHash;
    flags.push(unchanged
      ? flag(slug, 'expired', 'yellow', `service ended ${end}; output unchanged from live`)
      : flag(slug, 'expired', 'red', `service ended ${end}, before today (${todayYmd})`));
  }
  const start = input.service?.start ?? null;
  if (start && /^\d{8}$/.test(start) && start > todayYmd) {
    flags.push(flag(slug, 'future-start', 'yellow', `service does not start until ${start}`));
  }
  return flags;
}

/** Agencies whose registry location is near a point, as duplicate-check peers that are not in the run. */
export function nearbySlugs(
  agencies: Array<{ slug: string; center?: number[] | null; bbox?: number[] | null }>,
  point: [number, number] | null,
  maxKm = 100,
): string[] {
  if (!point) return [];
  const [lon, lat] = point;
  return agencies.filter(agency => {
    const bbox = agency.bbox;
    if (Array.isArray(bbox) && bbox.length === 4 && lat >= bbox[0] && lat <= bbox[2] && lon >= bbox[1] && lon <= bbox[3]) return true;
    const center = agency.center;
    if (!Array.isArray(center) || center.length < 2) return false;
    const dLat = (center[0] - lat) * 111;
    const dLon = (center[1] - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon) <= maxKm;
  }).map(agency => agency.slug);
}

export interface GateCandidate {
  slug: string;
  next: ArtifactSummary;
  service?: ServiceWindow;
}

export interface RegistryAgency {
  slug: string;
  center?: number[] | null;
  bbox?: number[] | null;
  hiddenInProduction?: boolean;
  staged?: boolean;
}

/**
 * Evaluate a whole run. Every candidate is compared with its live summary;
 * duplicate peers are the other candidates (as they will be published) plus
 * the live output of registry agencies near each candidate that are not in
 * the run. Hidden or staged agencies are never peers (a hidden copy, as in
 * #621, does not reach users), but a hidden candidate is still checked
 * against visible peers (sun-tran vs slorta, #615). Publish passes an empty
 * registry: the release already holds every agency users will see.
 * `getLive` should cache: a slug can be asked for more than once.
 */
export async function evaluateRun(options: {
  candidates: GateCandidate[];
  getLive: (slug: string) => Promise<ArtifactSummary | null>;
  registry: RegistryAgency[];
  todayYmd: string;
  allowMissingLive: boolean;
  /** Outputs already produced earlier in the same run (refresh gates one agency at a time). */
  extraPeers?: GatePeer[];
  concurrency?: number;
}): Promise<GateFlag[]> {
  const extraPeers = options.extraPeers ?? [];
  const inRun = new Set([...options.candidates.map(c => c.slug), ...extraPeers.map(p => p.slug)]);
  const concurrency = Math.max(1, options.concurrency ?? 6);
  const queue = [...options.candidates];
  const flags: GateFlag[] = [];
  const notPeers = new Set(options.registry.filter(a => a.hiddenInProduction || a.staged).map(a => a.slug));
  const runPeers: GatePeer[] = [...options.candidates.map(c => ({ slug: c.slug, summary: c.next })), ...extraPeers]
    .filter(peer => !notPeers.has(peer.slug));
  const worker = async () => {
    for (let candidate = queue.shift(); candidate; candidate = queue.shift()) {
      const live = await options.getLive(candidate.slug);
      const outside: GatePeer[] = [];
      for (const slug of nearbySlugs(options.registry, candidate.next.centroid)) {
        if (inRun.has(slug) || notPeers.has(slug)) continue;
        const summary = await options.getLive(slug);
        if (summary) outside.push({ slug, summary });
      }
      flags.push(...evaluateAgency(
        { slug: candidate.slug, live, next: candidate.next, service: candidate.service, allowMissingLive: options.allowMissingLive },
        [...runPeers, ...outside],
        options.todayYmd,
      ));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));
  return flags;
}

/** Cache a summary reader so each live artifact is fetched and parsed once per run. */
export function cachedSummaryReader(read: (slug: string) => Promise<ArtifactSummary | null>): (slug: string) => Promise<ArtifactSummary | null> {
  const cache = new Map<string, Promise<ArtifactSummary | null>>();
  return slug => {
    let hit = cache.get(slug);
    if (!hit) { hit = read(slug); cache.set(slug, hit); }
    return hit;
  };
}

/**
 * Read an agency's live route and stops artifacts with `get` (an R2 or public
 * HTTP getter) under each prefix in turn (e.g. the public release first, then
 * `atlas` for agencies not in the release, such as hidden ones).
 */
export async function readLiveSummary(
  slug: string,
  get: (key: string) => Promise<string | null>,
  prefixes: string[] = ['atlas'],
): Promise<ArtifactSummary | null> {
  for (const prefix of prefixes) {
    const geojson = await get(`${prefix}/${slug}.json`);
    if (geojson) return summarizeArtifact(geojson, await get(`${prefix}/${slug}-stops.json`));
  }
  return null;
}

/** GET a key from the public bucket; null on 404. */
export function publicBucketGetter(baseUrl: string, retries = 4): (key: string) => Promise<string | null> {
  const base = baseUrl.replace(/\/$/, '');
  return async key => {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(`${base}/${key}`, { cache: 'no-store' });
        if (response.status === 404) return null;
        if (response.ok) return await response.text();
        if (attempt >= retries) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        if (attempt >= retries) throw new Error(`Could not read ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  };
}

// ── Overrides ──────────────────────────────────────────────────────────────

export const ALLOW_FLAG = '--allow';
export const ALLOW_DROP_FLAG = '--allow-drop';

export interface GateOverrides {
  /** `--allow-drop`: accept a reviewed drop for every agency in the run (unchanged meaning). */
  allowDrop: boolean;
  /** `slug:flag` pairs from `--allow slug:flag`. */
  allow: string[];
}

/**
 * Pull `--allow <slug>:<flag>` (also `--allow=<slug>:<flag>`) and `--allow-drop`
 * out of argv. Returns the remaining args so callers never mistake an
 * override for a slug.
 */
export function parseGateOverrides(argv: string[]): GateOverrides & { rest: string[]; errors: string[] } {
  const allow: string[] = [];
  const rest: string[] = [];
  const errors: string[] = [];
  let allowDrop = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === ALLOW_DROP_FLAG) { allowDrop = true; continue; }
    let value: string | undefined;
    if (arg === ALLOW_FLAG) value = argv[++i];
    else if (arg.startsWith(`${ALLOW_FLAG}=`)) value = arg.slice(ALLOW_FLAG.length + 1);
    else { rest.push(arg); continue; }
    const match = /^([a-z0-9][a-z0-9-]*):([a-z-]+)$/.exec(value ?? '');
    if (!match) { errors.push(`${ALLOW_FLAG} expects <slug>:<flag>, got "${value ?? ''}"`); continue; }
    if (!(GATE_FLAGS as readonly string[]).includes(match[2])) {
      errors.push(`${ALLOW_FLAG} ${value}: unknown flag "${match[2]}" (one of ${GATE_FLAGS.join(', ')})`);
      continue;
    }
    allow.push(`${match[1]}:${match[2]}`);
  }
  return { allowDrop, allow, rest, errors };
}

/** Errors for overrides that name an agency the registry does not know. */
export function unknownOverrideSlugs(overrides: GateOverrides, knownSlugs: Iterable<string>): string[] {
  const known = new Set(knownSlugs);
  return overrides.allow
    .filter(pair => !known.has(pair.split(':')[0]))
    .map(pair => `${ALLOW_FLAG} ${pair}: unknown agency`);
}

/** Back to argv form, for forwarding overrides to a later command. */
export function overrideArgs(overrides: GateOverrides): string[] {
  return [...(overrides.allowDrop ? [ALLOW_DROP_FLAG] : []), ...overrides.allow.flatMap(pair => [ALLOW_FLAG, pair])];
}

export function isAllowed(f: GateFlag, overrides: GateOverrides): boolean {
  return overrides.allow.includes(`${f.slug}:${f.flag}`) || (f.flag === 'drop' && overrides.allowDrop);
}

export interface GateResult {
  flags: GateFlag[];
  /** Agencies with at least one red flag that was not allowed. */
  blocked: string[];
}

export function applyOverrides(flags: GateFlag[], overrides: GateOverrides): GateResult {
  const marked = flags.map(f => (f.level === 'red' && isAllowed(f, overrides) ? { ...f, allowed: true } : f));
  const blocked = [...new Set(marked.filter(f => f.level === 'red' && !f.allowed).map(f => f.slug))].sort();
  return { flags: marked, blocked };
}

/** One-line refusal reason for a blocked agency, naming the override that would accept each flag. */
export function blockReason(slug: string, result: GateResult): string | null {
  const reds = result.flags.filter(f => f.slug === slug && f.level === 'red' && !f.allowed);
  if (!reds.length) return null;
  return `release diff gate: ${reds.map(f => `${f.flag}: ${f.message} (pass ${f.flag === 'drop' ? `${ALLOW_DROP_FLAG} or ` : ''}${ALLOW_FLAG} ${slug}:${f.flag} after review)`).join('; ')}`;
}

// ── Report ─────────────────────────────────────────────────────────────────

export interface GateReport {
  runId: string;
  command: string;
  generatedAt: string;
  checked: string[];
  overrides: GateOverrides;
  blocked: string[];
  flags: GateFlag[];
}

export function buildGateReport(runId: string, command: string, checked: string[], overrides: GateOverrides, result: GateResult): GateReport {
  return {
    runId,
    command,
    generatedAt: new Date().toISOString(),
    checked: [...checked].sort(),
    overrides,
    blocked: result.blocked,
    flags: [...result.flags].sort((a, b) => a.slug.localeCompare(b.slug) || a.flag.localeCompare(b.flag)),
  };
}

export function formatGateMarkdown(report: GateReport): string {
  const row = (f: GateFlag) => `| ${f.slug} | ${f.level}${f.allowed ? ' (allowed)' : ''} | ${f.flag} | ${f.message.replace(/\|/g, '\\|')} |`;
  const section = (title: string, flags: GateFlag[]) => (flags.length
    ? [`## ${title}`, '', '| agency | level | flag | detail |', '|---|---|---|---|', ...flags.map(row), '']
    : [`## ${title}`, '', 'None.', '']);
  const reds = report.flags.filter(f => f.level === 'red');
  return [
    `# Release diff: ${report.runId}`,
    '',
    `Command: ${report.command}. Generated ${report.generatedAt}. ${report.checked.length} agencies checked against live data.`,
    `Overrides: ${overrideArgs(report.overrides).join(' ') || 'none'}.`,
    '',
    report.blocked.length
      ? `**Blocked (${report.blocked.length}):** ${report.blocked.join(', ')}. Nothing is published for these agencies until each red flag is fixed or accepted with \`${ALLOW_FLAG} <slug>:<flag>\` after review.`
      : '**No agency is blocked.**',
    '',
    ...section('Red', reds),
    ...section('Yellow (informational)', report.flags.filter(f => f.level === 'yellow')),
  ].join('\n');
}

export function formatGateSummary(report: GateReport, paths: { md: string; json: string }): string {
  const reds = report.flags.filter(f => f.level === 'red');
  const yellows = report.flags.filter(f => f.level === 'yellow');
  const lines = [
    `Release diff gate (${report.command}): ${report.checked.length} agencies checked, ${reds.filter(f => !f.allowed).length} red, ${reds.filter(f => f.allowed).length} red allowed, ${yellows.length} yellow.`,
    ...reds.map(f => `  RED${f.allowed ? ' (allowed)' : ''} ${f.slug}: ${f.flag} - ${f.message}`),
    ...yellows.map(f => `  yellow ${f.slug}: ${f.flag} - ${f.message}`),
    report.blocked.length ? `  Blocked: ${report.blocked.join(', ')}` : '  Nothing blocked.',
    `  Report: ${paths.md}`,
  ];
  return lines.join('\n');
}

/** Write tmp/release-diff/<runId>.md and .json; returns their paths. */
export function writeGateReport(report: GateReport, dir = resolve('tmp/release-diff')): { md: string; json: string } {
  mkdirSync(dir, { recursive: true });
  const safe = report.runId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const md = resolve(dir, `${safe}.md`);
  const json = resolve(dir, `${safe}.json`);
  writeFileSync(md, `${formatGateMarkdown(report)}\n`);
  writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  return { md, json };
}

/** Run id for commands that are not tied to a release id. */
export function gateRunId(command: string, now = new Date()): string {
  return `${command}-${now.toISOString().replace(/[:.]/g, '-')}`;
}
