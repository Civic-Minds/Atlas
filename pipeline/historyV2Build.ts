/**
 * Build-time rules for History snapshots (pure; build-history.ts only calls these).
 *
 *  - join legacy per-route change files and v2 sidecar entries by period key
 *  - drop invalid snapshots (empty/unparseable label, bad refDate/year, year after the build year)
 *  - order by real date, then keep one snapshot per route per year
 */
import type { HeadwayByPeriod } from '../shared/config.js';
import { yearOfRefDate, type HistorySnapshotV2, type HistoryV2SidecarRoute } from '../shared/historyV2.js';
import type { HolidayPeriodDrop, RepickedPeriod } from './historyRefQuality.js';
import { getPeriodKeySortValue, labelFromRefDate, parsePeriodKey } from './historyPeriods.js';
import type { ShapeGap } from './historyShapes.js';

export interface ArchiveChange {
  periodKey: string;
  headway?: number;
  routeLongName?: string;
  label?: string;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: unknown;
  processedAt?: string;
}

export interface BuiltSnapshot {
  periodKey: string;
  label: string;
  year: number;
  /** null only for a weekend-only snapshot (see BuildOptions.weekendOnlyRoute): the weekday value is blank, never 0. */
  weekdayHeadwayMin: number | null;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: unknown;
  v2?: HistorySnapshotV2;
  processedAt?: string;
}

export type DropReason =
  | 'empty label'
  | 'unparseable label'
  | 'bad refDate'
  | 'bad year'
  | 'after build year'
  | 'no weekday headline';

export interface DropRecord { slug: string; route: string; label: string; reason: DropReason }

export interface BuildReport {
  drops: DropRecord[];
  /** Same-year snapshots whose headlines disagreed by more than 25% (the later was kept). */
  yearDisagreements: Array<{ slug: string; route: string; year: number }>;
  superseded: number;
  mixedMethodRoutes: string[];
  /** Report-only visibility checks per agency (see visibilityCheck); nothing here changes a snapshot. */
  visibility: AgencyVisibility[];
  /** Sidecar periods left out whole because their reference date is a holiday-week date. */
  droppedHolidayPeriods: HolidayPeriodDrop[];
  /** Sidecar periods the v2 backfill read at a normal week of the same feed instead of a holiday or split week (kept, with the new date). */
  repickedPeriods: RepickedPeriod[];
  /** Years whose routes lack real shape lines (CIV-843). */
  shapeGaps: ShapeGap[];
}

export function newBuildReport(): BuildReport {
  return { drops: [], yearDisagreements: [], superseded: 0, mixedMethodRoutes: [], visibility: [], droppedHolidayPeriods: [], repickedPeriods: [], shapeGaps: [] };
}

export interface VisibilitySpike { route: string; label: string; year: number; value: number; prev: number; next: number }

export interface AgencyVisibility {
  slug: string;
  /** (a) current routes with no kept snapshot in the last 5 years. */
  currentWithoutRecentSnapshot: string[];
  /** (b) history keys that match no current route (candidate split or renumbered keys). */
  oldKeysWithoutCurrentMatch: string[];
  /** (c) weekday value >= 5x both the previous and the next kept snapshot. */
  spikes: VisibilitySpike[];
  /** One entry per configured supplemental feed (e.g. rail). Empty when the agency has none. */
  supplementalFeeds: SupplementalVisibility[];
  /** Plain-language lines for the build log, one per excluded supplemental feed. */
  supplementalNotes: string[];
}

export interface SupplementalVisibility {
  url: string;
  includedInHistory: boolean;
  /** Earliest sidecar period that holds routes from this feed; null when none does. */
  firstSnapshot: string | null;
}

/** What the build knows about an agency's supplemental feeds. */
export interface SupplementalInput {
  /** supplementalFeedUrls from the agency config (public/data/index.json). */
  urls: string[];
  /** Sidecar facts: feed url -> period keys of sidecars that list routes from it. */
  sidecarPeriodsByUrl?: Record<string, string[]>;
}

export const SPIKE_FACTOR = 5;
export const RECENT_YEARS = 5;

/**
 * Report-only: never drops, hides or edits a snapshot.
 * `history` is route key -> kept snapshots (ascending); `currentKeys` are the routes of the
 * newest feed; `resolves(key)` says whether an old key maps to a current route (aliases
 * included), defaulting to an exact key match.
 */
export function visibilityCheck(
  slug: string,
  history: Record<string, Array<{ label: string; year: number; weekdayHeadwayMin: number | null }>>,
  currentKeys: string[],
  buildYear: number,
  resolves: (key: string) => boolean = k => currentKeys.includes(k),
  supplemental?: SupplementalInput,
): AgencyVisibility {
  const current = new Set(currentKeys);
  const recent = new Set<string>();
  const spikes: VisibilitySpike[] = [];
  for (const [route, snaps] of Object.entries(history)) {
    if (snaps.some(s => s.year > buildYear - RECENT_YEARS)) recent.add(route);
    for (let i = 1; i < snaps.length - 1; i++) {
      const v = snaps[i].weekdayHeadwayMin, a = snaps[i - 1].weekdayHeadwayMin, b = snaps[i + 1].weekdayHeadwayMin;
      if (v == null || a == null || b == null) continue; // a blank (weekend-only) weekday value has no spike
      if (v >= SPIKE_FACTOR * a && v >= SPIKE_FACTOR * b) {
        spikes.push({ route, label: snaps[i].label, year: snaps[i].year, value: v, prev: a, next: b });
      }
    }
  }
  const cmp = (x: string, y: string) => x.localeCompare(y, undefined, { numeric: true });
  const supplementalFeeds: SupplementalVisibility[] = (supplemental?.urls ?? []).map(url => {
    const periods = [...(supplemental?.sidecarPeriodsByUrl?.[url] ?? [])].sort((a, b) => getPeriodKeySortValue(a) - getPeriodKeySortValue(b));
    return { url, includedInHistory: periods.length > 0, firstSnapshot: periods[0] ?? null };
  });
  // The data does not say which current routes belong to a feed, so an excluded feed lists the
  // current routes that have no history at all (it can include bus routes new to the feed).
  const noHistory = [...current].filter(k => !(history[k]?.length)).sort(cmp);
  const supplementalNotes = supplementalFeeds.filter(f => !f.includedInHistory).map(f =>
    `${slug}: supplemental feed (${f.url}) not in History: ${noHistory.length} current routes have no history${noHistory.length ? ` (${noHistory.join(', ')})` : ''}`);
  return {
    slug,
    supplementalFeeds,
    supplementalNotes,
    currentWithoutRecentSnapshot: [...current].filter(k => !recent.has(k)).sort(cmp),
    oldKeysWithoutCurrentMatch: Object.keys(history).filter(k => !resolves(k)).sort(cmp),
    spikes,
  };
}

const MIN_YEAR = 1990;

/** Why a candidate cannot be published, or null when it is fine. */
export function invalidReason(label: string, year: number, v2: HistorySnapshotV2 | undefined, buildYear: number): DropReason | null {
  if (v2 && yearOfRefDate(v2.refDate) == null) return 'bad refDate';
  if (!label || !label.trim()) return 'empty label';
  if (!/(?:19|20)\d{2}/.test(label)) return 'unparseable label';
  if (!Number.isInteger(year) || year < MIN_YEAR) return 'bad year';
  if (year > buildYear) return 'after build year';
  return null;
}

/** When an old change file was written (its processedAt), as a year and label; null if unknown or after this year. */
function readDate(processedAt: string | undefined, buildYear: number): { year: number; label: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(processedAt ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const label = labelFromRefDate(`${m[1]}${m[2]}${m[3]}`);
  return year <= buildYear && label ? { year, label } : null;
}

export interface Candidate {
  periodKey: string;
  change?: ArchiveChange;
  v2?: HistoryV2SidecarRoute & { refDate: string };
}

/** Real-date sort key: refDate when known, else the period key's date. */
export function effectiveDate(c: { v2?: { refDate: string }; periodKey: string }): number {
  const ref = c.v2 ? Number(c.v2.refDate) : NaN;
  return Number.isFinite(ref) ? ref : getPeriodKeySortValue(c.periodKey);
}

/**
 * Join change files and sidecar entries that share a period key into one candidate each
 * (sidecar keyed by period key, not label).
 */
export function joinCandidates(changes: ArchiveChange[], sidecar: Array<{ periodKey: string; v2: HistoryV2SidecarRoute & { refDate: string } }>): Candidate[] {
  const byPeriod = new Map<string, Candidate>();
  for (const c of changes) byPeriod.set(c.periodKey, { periodKey: c.periodKey, change: c });
  for (const s of sidecar) {
    const cur = byPeriod.get(s.periodKey);
    if (cur) cur.v2 = s.v2; else byPeriod.set(s.periodKey, { periodKey: s.periodKey, v2: s.v2 });
  }
  return [...byPeriod.values()];
}

function disagree(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) / Math.min(a, b) > 0.25;
}

export interface BuildOptions {
  /**
   * True only for a route that takes just the weekend part of a day-type split (config alias with
   * days: 'weekend'). Then a v2 candidate with a Saturday or Sunday value and no weekday number is kept
   * with a blank weekday value instead of being dropped as 'no weekday headline'. Every other route
   * (the default) drops a candidate with no weekday number exactly as before.
   */
  weekendOnlyRoute?: boolean;
}

/**
 * Candidates -> published snapshots, ascending by real date, one per year. Winner of a
 * year is the latest refDate (when both have one), else the latest period key, then
 * processedAt.
 */
export function buildRouteSnapshots(
  slug: string,
  route: string,
  candidates: Candidate[],
  buildYear: number,
  report: BuildReport,
  opts: BuildOptions = {},
): BuiltSnapshot[] {
  const valid: BuiltSnapshot[] = [];
  let usedV1 = false;
  let usedV2 = false;
  for (const c of candidates) {
    const v2 = c.v2 ? { refDate: c.v2.refDate, key: route, rep: c.v2.rep, sat: c.v2.sat, sun: c.v2.sun, flag: c.v2.flag } : undefined;
    if (v2) { for (const k of ['sat', 'sun', 'flag'] as const) if (v2[k] === undefined) delete v2[k]; }
    const parsed = parsePeriodKey(c.periodKey);
    // An old change file is keyed by its feed's END date (refresh.ts), so a timetable still running
    // that ends after this year read as a future year and was dropped, leaving an earlier timetable as
    // this year's point (CIV-394: AC Transit "Apr 2027"). Such a file is dated by when it was read.
    const read = !v2 && parsed.year > buildYear ? readDate(c.change?.processedAt, buildYear) : null;
    const year = v2 ? (yearOfRefDate(v2.refDate) ?? NaN) : read ? read.year : parsed.year;
    const label = read ? read.label : c.change?.label ?? (v2 ? (labelFromRefDate(v2.refDate) ?? '') : parsed.label);
    const reason = invalidReason(label, year, v2, buildYear);
    if (reason) { report.drops.push({ slug, route, label, reason }); continue; }
    // A v2 value is the representative; a limited or blank route has no number and is never
    // backfilled from the fastest pattern in the old change file.
    const h = v2 ? v2.rep.h : c.change?.headway;
    const weekendOnly = h == null && opts.weekendOnlyRoute === true && v2 !== undefined
      && [v2.sat, v2.sun].some(d => d !== undefined && !('none' in d));
    if (h == null && !weekendOnly) { report.drops.push({ slug, route, label, reason: 'no weekday headline' }); continue; }
    if (v2) usedV2 = true; else usedV1 = true;
    valid.push({
      periodKey: c.periodKey,
      label,
      year,
      weekdayHeadwayMin: h ?? null,
      headwayByPeriod: v2 ? v2.rep.p : c.change?.headwayByPeriod,
      geometry: c.change?.geometry,
      v2,
      processedAt: c.change?.processedAt,
    });
  }
  if (usedV1 && usedV2) report.mixedMethodRoutes.push(`${slug}/${route}`);

  const rank = (s: BuiltSnapshot) => effectiveDate({ v2: s.v2, periodKey: s.periodKey });
  const later = (a: BuiltSnapshot, b: BuiltSnapshot): boolean => {
    // refDate only when both have one; otherwise both fall back to the period key
    const bothRef = a.v2 && b.v2;
    const ka = bothRef ? Number(a.v2!.refDate) : getPeriodKeySortValue(a.periodKey);
    const kb = bothRef ? Number(b.v2!.refDate) : getPeriodKeySortValue(b.periodKey);
    if (ka !== kb) return ka > kb;
    return (a.processedAt ?? '') >= (b.processedAt ?? '');
  };
  const winners = new Map<number, BuiltSnapshot>();
  for (const s of valid) {
    const cur = winners.get(s.year);
    if (!cur) { winners.set(s.year, s); continue; }
    report.superseded++;
    if (disagree(cur.weekdayHeadwayMin, s.weekdayHeadwayMin)) report.yearDisagreements.push({ slug, route, year: s.year });
    if (later(s, cur)) winners.set(s.year, s);
  }
  return [...winners.values()].sort((a, b) => rank(a) - rank(b) || a.year - b.year);
}

/**
 * v2 publish filter. Legacy history is change-only: a snapshot is dropped when its weekday value
 * equals the previous one. Under v2 a snapshot that came from a sidecar (it carries `v2`) is a
 * documented "this route ran in this year" fact and is never dropped, so routesForYear lists every
 * route in every year it ran. Snapshots from the old per-route change files (no `v2`) only record
 * changes, so for them an unchanged year is unknown and the legacy rule still applies: nothing is
 * invented for a period that has no sidecar.
 */
export function filterSnapshotsForPublish<T extends { weekdayHeadwayMin: number | null; v2?: unknown }>(
  snapshots: T[],
  opts: { materializeAllPeriods: boolean; keepEveryV2Year: boolean },
): T[] {
  if (opts.materializeAllPeriods) return [...snapshots];
  return snapshots.filter((s, i) =>
    (opts.keepEveryV2Year && s.v2 !== undefined) || i === 0 || s.weekdayHeadwayMin !== snapshots[i - 1].weekdayHeadwayMin);
}

/**
 * A route whose first and last value are equal is normally left out (nothing changed). A v2 route
 * with any sidecar-backed snapshot ran in those years, so it stays: a flat route is still on the
 * map in the year being viewed.
 */
export function isFlatRouteToSkip(
  snapshots: Array<{ weekdayHeadwayMin: number | null; v2?: unknown }>,
  opts: { materializeAllPeriods: boolean; hasTripDuration: boolean; keepEveryV2Year: boolean },
): boolean {
  if (opts.materializeAllPeriods || opts.hasTripDuration) return false;
  if (opts.keepEveryV2Year && snapshots.some(s => s.v2 !== undefined)) return false;
  return snapshots[0].weekdayHeadwayMin === snapshots[snapshots.length - 1].weekdayHeadwayMin;
}
