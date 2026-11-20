import { FOCUS_AGENCY_SLUGS, PRODUCT_FOCUS, isFocusAgency } from './rules/focus.js';
import { earliestFiguresDay, type LiveCoverage } from './liveCoverage.js';
import { LIVE_MIN_DAYS_TO_SHOW } from './rules/live.js';
import { shortDate } from './dateText.js';

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
  agencies: ReadonlyArray<{ slug: string; name: string; /** The place beside the name when the name alone isn't unique ("MTA NYCT Bus", Manhattan), as the agencies page shows it. */ place?: string }>;
  /** History's agencies (shared/data/history-agencies.json). */
  historySlugs: readonly string[];
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

/** Recorded now: an archived agency on the focus list's Live set (the others' recorders are paused and their data has expired). */
function recordedNow(slug: string, s: CoverageSources): boolean {
  return s.liveArchiveSlugs.includes(slug) && (PRODUCT_FOCUS.live as readonly string[]).includes(slug);
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
  const rows = s.agencies.map(a => {
    const mcp = mcpLiveState(a.slug, s);
    return {
      slug: a.slug,
      name: a.name,
      place: a.place ?? null,
      focus: isFocusAgency(a.slug),
      history: s.historySlugs.includes(a.slug),
      liveRecorded: recordedNow(a.slug, s),
      liveRealtime: s.liveMapSlugs.includes(a.slug),
      liveReport: recordedNow(a.slug, s),
      studioSchedule: s.studioSlugs.includes(a.slug),
      studioVehicles: s.vehiclesSlugs.includes(a.slug),
      mcpLive: mcp.state,
      mcpLiveFrom: mcp.from,
    };
  });
  const order = (slug: string) => { const i = FOCUS_AGENCY_SLUGS.indexOf(slug); return i < 0 ? Infinity : i; };
  return rows.filter(hasMoreThanMap).sort((a, b) => order(a.slug) - order(b.slug) || a.name.localeCompare(b.name));
}
