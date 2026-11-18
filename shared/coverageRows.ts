import { FOCUS_AGENCY_SLUGS, PRODUCT_FOCUS, isFocusAgency } from './rules/focus.js';
import { earliestFiguresDay, type LiveCoverage } from './liveCoverage.js';
import { LIVE_MIN_DAYS_TO_SHOW } from './rules/live.js';
import { shortDate } from './dateText.js';

/**
 * The local coverage page's rows (CIV-1871): one per agency that has more than the map, focus agencies first, each column read from
 * the source that decides it (the focus list, History's agency list, Live's archive and map lists, Studio's files,
 * the Live coverage files). Nothing here is typed per agency. Pure, so a test can check it.
 */

export interface CoverageSources {
  /** The agencies on the map (the public catalog). */
  agencies: ReadonlyArray<{ slug: string; name: string }>;
  /** History's agencies (shared/data/history-agencies.json). */
  historySlugs: readonly string[];
  /** Every agency Live's archivers know (LIVE_ARCHIVE_SLUGS). */
  liveArchiveSlugs: readonly string[];
  /** Agencies on Live's map (LIVE_AGENCY_SLUGS). */
  liveMapSlugs: readonly string[];
  /** Agencies with a Schedule Changes file, and with a buses-needed file (tmp/studio, the dev server's listing). */
  studioSlugs: readonly string[];
  vehiclesSlugs: readonly string[];
  /** Live coverage files read from this Mac (what releaseLivePrivate writes), by agency; empty where none. */
  coverage: Readonly<Record<string, LiveCoverage>>;
  today: string;
}

export interface CoverageRow {
  slug: string;
  name: string;
  focus: boolean;
  history: boolean;
  /** Live: what the archive does (recording now, or configured and paused) and whether Live's own map has the agency. */
  liveRecorded: 'recording' | 'paused' | null;
  liveRealtime: boolean;
  /** Studio: which of its views have a file for the agency. */
  studioSchedule: boolean;
  studioVehicles: boolean;
  /**
   * The MCP's answers: schedule answers for every agency on the map; Live answers once recordings give figures ('ready'), a
   * date they start ('from'), or what blocks them ('paused', 'unread' when no coverage file was read); real-time none yet.
   */
  mcpLive: 'ready' | 'from' | 'paused' | 'unread' | null;
  mcpLiveFrom: string | null;
}

function liveRecordedState(slug: string, s: CoverageSources): CoverageRow['liveRecorded'] {
  if (!s.liveArchiveSlugs.includes(slug)) return null;
  return (PRODUCT_FOCUS.live as readonly string[]).includes(slug) ? 'recording' : 'paused';
}

/** The MCP's Live answers: where recordings are kept and how far along they are, from the coverage files. */
function mcpLiveState(slug: string, s: CoverageSources): { state: CoverageRow['mcpLive']; from: string | null } {
  if (!s.liveArchiveSlugs.includes(slug)) return { state: null, from: null };
  const c = s.coverage[slug];
  if (!c || c.daysRecorded == null) return { state: 'unread', from: null };
  if (c.recordingNow !== true) return { state: 'paused', from: null };
  const start = earliestFiguresDay(c, s.today);
  if (start) return { state: 'from', from: shortDate(start) ?? start };
  return c.daysRecorded > LIVE_MIN_DAYS_TO_SHOW ? { state: 'ready', from: null } : { state: 'from', from: null };
}

/** Whether an agency has anything beyond the map and the MCP's schedule answers (which every agency has): focus, History, Live, Studio or Live answers. */
export const hasMoreThanMap = (r: CoverageRow): boolean =>
  r.focus || r.history || r.liveRecorded !== null || r.liveRealtime || r.studioSchedule || r.studioVehicles || r.mcpLive !== null;

/** One row for each agency that has more than the map (CIV-1871, Ryan: every agency is on the map, so the rest is noise). */
export function coverageRows(s: CoverageSources): CoverageRow[] {
  const rows = s.agencies.map(a => {
    const mcp = mcpLiveState(a.slug, s);
    return {
      slug: a.slug,
      name: a.name,
      focus: isFocusAgency(a.slug),
      history: s.historySlugs.includes(a.slug),
      liveRecorded: liveRecordedState(a.slug, s),
      liveRealtime: s.liveMapSlugs.includes(a.slug),
      studioSchedule: s.studioSlugs.includes(a.slug),
      studioVehicles: s.vehiclesSlugs.includes(a.slug),
      mcpLive: mcp.state,
      mcpLiveFrom: mcp.from,
    };
  });
  const order = (slug: string) => { const i = FOCUS_AGENCY_SLUGS.indexOf(slug); return i < 0 ? Infinity : i; };
  return rows.filter(hasMoreThanMap).sort((a, b) => order(a.slug) - order(b.slug) || a.name.localeCompare(b.name));
}
