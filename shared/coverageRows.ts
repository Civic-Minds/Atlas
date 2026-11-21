import { FOCUS_AGENCY_SLUGS, isFocusAgency } from './rules/focus.js';
import { earliestFiguresDay, type LiveCoverage } from './liveCoverage.js';
import { LIVE_MIN_DAYS_TO_SHOW } from './rules/live.js';
import { shortDate } from './dateText.js';
import { liveFeedStatus } from './liveArchiveFeeds.js';
import { agencyGroupName, groupAgencies } from './agencyGroups.js';

/**
 * The local coverage page's rows (CIV-1871): one per agency that has more than the map, focus agencies first, each column read from
 * the source that decides it (the focus list, History's agency list, Live's archive and map lists, Studio's files,
 * the Live coverage files). Nothing here is typed per agency. Pure, so a test can check it.
 */

/** Where the dev API serves the private bucket's coverage files, and the key prefix inside it (scripts/mcp/liveData.ts liveSplitPaths.coverage). */
export const MCP_COVERAGE_API_URL = '/api/mcp-coverage';
export const MCP_COVERAGE_PREFIX = 'live';

export interface CoverageSources {
  /** The agencies on the map (the public catalog). */
  agencies: ReadonlyArray<{ slug: string; name: string; /** The place beside the name when the name alone isn't unique ("MTA NYCT Bus", Manhattan), as the agencies page shows it. */ place?: string; parentAgency?: string }>;
  /** History's agencies (shared/data/history-agencies.json). */
  historySlugs: readonly string[];
  /** Distinct History years of every archived agency, public or not (the dev server reads the local history-config copy); empty where unknown. */
  historyYears?: Readonly<Record<string, number>>;
  /** Every agency Live's archivers know (LIVE_ARCHIVE_SLUGS). */
  liveArchiveSlugs: readonly string[];
  /** Agencies on Live's map (LIVE_AGENCY_SLUGS). */
  liveMapSlugs: readonly string[];
  /** Agencies with a Schedules file, and with a buses-needed file (tmp/studio, the dev server's listing). */
  studioSlugs: readonly string[];
  vehiclesSlugs: readonly string[];
  /** Live coverage files read from this Mac (what releaseLivePrivate writes), by agency; empty where none. */
  coverage: Readonly<Record<string, LiveCoverage>>;
  today: string;
}

export interface CoverageRow {
  slug: string;
  name: string;
  place: string | null;
  focus: boolean;
  history: boolean;
  /** Distinct History years in the archive; 0 where none (or not read). Public History needs 10 (MIN_HISTORY_DISTINCT_YEARS). */
  historyYears: number;
  /** Live: recorded now, on Live's own map, and whether it has a Live report page (a paused recorder gives nothing usable, so it isn't shown). */
  liveRecorded: boolean;
  liveRealtime: boolean;
  liveReport: boolean;
  /** Studio: which of its views have a file for the agency. */
  studioSchedule: boolean;
  studioVehicles: boolean;
  /**
   * The MCP's answers: schedule answers for every agency on the map; Live answers once recordings give figures ('ready'), a
   * date they start ('from'), or what blocks them ('paused', 'unread' when no coverage file was read); real-time none yet.
   */
  mcpLive: 'ready' | 'from' | null;
  mcpLiveFrom: string | null;
}

/** Recorded now: an archived agency whose recorder runs, by the one recording state (shared/liveArchiveFeeds.ts) the MCP and Live read. */
function recordedNow(slug: string, s: CoverageSources): boolean {
  return s.liveArchiveSlugs.includes(slug) && liveFeedStatus(slug).status === 'recording';
}

/** The MCP's Live answers: where recordings are kept and how far along they are, from the coverage files. */
function mcpLiveState(slug: string, s: CoverageSources): { state: CoverageRow['mcpLive']; from: string | null } {
  if (!recordedNow(slug, s)) return { state: null, from: null };
  const c = s.coverage[slug];
  if (!c || c.daysRecorded == null) return { state: null, from: null };
  if (c.recordingNow !== true) return { state: null, from: null };
  const start = earliestFiguresDay(c, s.today);
  if (start) return { state: 'from', from: shortDate(start) ?? start };
  return c.daysRecorded > LIVE_MIN_DAYS_TO_SHOW ? { state: 'ready', from: null } : { state: 'from', from: null };
}

/** Whether an agency has anything beyond the map and the MCP's schedule answers (which every agency has): focus, History, Live, Studio or Live answers. */
export const hasMoreThanMap = (r: CoverageRow): boolean =>
  r.focus || r.history || r.liveRecorded || r.liveRealtime || r.liveReport || r.studioSchedule || r.studioVehicles || r.mcpLive !== null;

/** One row for each agency that has more than the map (CIV-1871, Ryan: every agency is on the map, so the rest is noise). */
export function coverageRows(s: CoverageSources): CoverageRow[] {
  const rowOf = (a: CoverageSources['agencies'][number]): CoverageRow => {
    const mcp = mcpLiveState(a.slug, s);
    return {
      slug: a.slug,
      name: a.name,
      place: a.place ?? null,
      focus: isFocusAgency(a.slug),
      history: s.historySlugs.includes(a.slug),
      historyYears: s.historyYears?.[a.slug] ?? 0,
      liveRecorded: recordedNow(a.slug, s),
      liveRealtime: s.liveMapSlugs.includes(a.slug),
      liveReport: recordedNow(a.slug, s),
      studioSchedule: s.studioSlugs.includes(a.slug),
      studioVehicles: s.vehiclesSlugs.includes(a.slug),
      mcpLive: mcp.state,
      mcpLiveFrom: mcp.from,
    };
  };
  // One entry per agency or region (shared/agencyGroups.ts, CIV-1963): a parent's feeds are one row under its name. A
  // column is yes when any feed has it; History's years and the MCP's Live answer read the feed that has the most.
  const groups = groupAgencies(s.agencies);
  const rows = groups.map(g => {
    const parts = g.members.map(rowOf);
    if (!g.parent) return parts[0];
    const any = (k: 'focus' | 'history' | 'liveRecorded' | 'liveRealtime' | 'liveReport' | 'studioSchedule' | 'studioVehicles') => parts.some(r => r[k]);
    const mcp = parts.find(r => r.mcpLive === 'ready') ?? parts.find(r => r.mcpLive === 'from');
    return {
      slug: g.slug,
      name: agencyGroupName(g, a => a.name),
      place: null,
      focus: any('focus'),
      history: any('history'),
      historyYears: Math.max(...parts.map(r => r.historyYears)),
      liveRecorded: any('liveRecorded'),
      liveRealtime: any('liveRealtime'),
      liveReport: any('liveReport'),
      studioSchedule: any('studioSchedule'),
      studioVehicles: any('studioVehicles'),
      mcpLive: mcp?.mcpLive ?? null,
      mcpLiveFrom: mcp?.mcpLiveFrom ?? null,
    };
  });
  // A parent row sits where its earliest focus feed would.
  const focusAt = (slug: string) => { const i = FOCUS_AGENCY_SLUGS.indexOf(slug); return i < 0 ? Infinity : i; };
  const orderBySlug = new Map(groups.map(g => [g.slug, Math.min(...g.members.map(m => focusAt(m.slug)))]));
  const order = (r: CoverageRow) => orderBySlug.get(r.slug) ?? Infinity;
  return rows.filter(hasMoreThanMap).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}
