/**
 * CIV-1430: rebuild a published History v2 period at its ORIGINAL reference date (backfill-history-v2.ts --pin-from).
 *
 * Pinning reads each zip at the published sidecar's own vote-picked week, so a rebuild changes only what the run
 * is meant to add (weekend values). Only vote-picked sidecars can be pinned (CIV-1839).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseHistoryV2Sidecar } from '../shared/historyV2Reader.js';
import type { HistoryV2Sidecar } from '../shared/historyV2.js';
import type { AgencyProcessOverrides } from './agencyFeeds.js';

/**
 * The published sidecars under <dir>/history-v2/{slug}/, by period key, as parsed from the raw JSON (so the
 * top-level key order is the file's own). Throws on an invalid file or one whose slug/periodKey disagrees with its path.
 */
export function readPinnedSidecars(dir: string, slug: string): Map<string, HistoryV2Sidecar> {
  const sidecarDir = resolve(dir, 'history-v2', slug);
  const out = new Map<string, HistoryV2Sidecar>();
  if (!existsSync(sidecarDir)) throw new Error(`--pin-from: no published sidecars at ${sidecarDir}`);
  for (const f of readdirSync(sidecarDir).filter(n => n.endsWith('.json')).sort()) {
    const periodKey = f.slice(0, -'.json'.length);
    const raw = JSON.parse(readFileSync(resolve(sidecarDir, f), 'utf8')) as HistoryV2Sidecar;
    const parsed = parseHistoryV2Sidecar(raw);
    if (!parsed.ok) throw new Error(`--pin-from ${f}: ${parsed.error.code} at ${parsed.error.path}: ${parsed.error.message}`);
    if (raw.slug !== slug || raw.periodKey !== periodKey) throw new Error(`--pin-from ${f}: slug/periodKey in the file (${raw.slug}/${raw.periodKey}) do not match the path`);
    out.set(periodKey, raw);
  }
  return out;
}

export interface PinnedRead {
  refDate: string;
  /** How the zip is read (for the report). */
  how: string;
  overrides: AgencyProcessOverrides;
}

/**
 * How to read a zip at a published sidecar's date: a vote-picked sidecar (CIV-1101 Part B) re-reads its stored
 * week with today's picker anchored at that week's start. Any other sidecar (legacy, or re-picked by the retired
 * holiday rule) throws: the old picker that wrote it is gone (CIV-1839), so it must be re-picked by vote first
 * (CIV-1313 approved replacement). The caller checks the processor really read `refDate`.
 */
export function pinnedReadFor(sc: Pick<HistoryV2Sidecar, 'refDate' | 'refDateQuality'>): PinnedRead {
  const q = sc.refDateQuality;
  if (q?.pickedBy === 'vote' && q.weekStart) {
    return { refDate: sc.refDate, how: `vote-picked week from ${q.weekStart}`, overrides: { serviceAnchor: q.weekStart } };
  }
  throw new Error(`--pin-from: the published sidecar (refDate ${sc.refDate}) is not stamped as picked by vote (refDateQuality.pickedBy ${q?.pickedBy ?? 'absent'}); the old reference-date picker is gone, so re-pick it by vote first (CIV-1313)`);
}

/** The published sidecars' raw bodies by period key (the bytes a merge must keep). */
export function readPinnedBodies(dir: string, slug: string): Map<string, string> {
  const sidecarDir = resolve(dir, 'history-v2', slug);
  const out = new Map<string, string>();
  for (const f of readdirSync(sidecarDir).filter(n => n.endsWith('.json')).sort()) out.set(f.slice(0, -'.json'.length), readFileSync(resolve(sidecarDir, f), 'utf8'));
  return out;
}
