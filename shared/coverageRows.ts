import { FOCUS_AGENCY_SLUGS, PRODUCT_FOCUS, isFocusAgency } from './rules/focus.js';
import { earliestFiguresDay, type LiveCoverage } from './liveCoverage.js';
import { LIVE_MIN_DAYS_TO_SHOW } from './rules/live.js';
import { shortDate } from './dateText.js';
import { MISSING_VALUE } from './missingValue.js';

/**
 * The local coverage page's rows (CIV-1871): one per agency that has more than the map, focus agencies first, each column read from
 * the source that decides it (the focus list, History's agency list, Live's archive and map lists, Studio's files,
 * the Live coverage files). Nothing here is typed per agency. Pure, so a test can check it.
 */

export const COVERAGE_COLUMNS = {
  agency: 'Agency',
  focus: 'Focus',
  history: 'History',
  liveRecorded: 'Live recorded',
  liveRealtime: 'Live real-time',
  studio: 'Studio',
  mcpFigures: 'MCP figures',
  figuresStart: 'Figures start',
} as const;

/** The page's own words (new UI text: Ryan signs it off). */
export const COVERAGE_TEXT = {
  intro: 'What each agency has beyond the map. Every agency is on the map, so only agencies with something more are listed.',
  focusHeading: 'Focus Agencies',
  othersHeading: 'Other Agencies',
  factsFailed: 'The dev server didn’t list the Studio and Live files, so those columns are empty.',
} as const;

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
  liveRecorded: string;
  liveRealtime: boolean;
  studio: string;
  mcpFigures: string;
  figuresStart: string;
}

function liveRecordedText(slug: string, s: CoverageSources): string {
  if (!s.liveArchiveSlugs.includes(slug)) return MISSING_VALUE;
  return (PRODUCT_FOCUS.live as readonly string[]).includes(slug) ? 'Recording' : 'Paused';
}

/** The MCP's Live figures: where recordings are kept and how far along they are, from the coverage files. */
function mcpText(slug: string, s: CoverageSources): { figures: string; start: string } {
  if (!s.liveArchiveSlugs.includes(slug)) return { figures: MISSING_VALUE, start: MISSING_VALUE };
  const c = s.coverage[slug];
  if (!c || c.daysRecorded == null) return { figures: 'Not read', start: MISSING_VALUE };
  if (c.recordingNow !== true) return { figures: 'Paused', start: MISSING_VALUE };
  const start = earliestFiguresDay(c, s.today);
  if (start) return { figures: 'Building', start: shortDate(start) ?? start };
  return { figures: c.daysRecorded > LIVE_MIN_DAYS_TO_SHOW ? 'Yes' : 'Building', start: MISSING_VALUE };
}

function studioText(slug: string, s: CoverageSources): string {
  const changes = s.studioSlugs.includes(slug), buses = s.vehiclesSlugs.includes(slug);
  return changes && buses ? 'Changes and buses' : changes ? 'Changes' : buses ? 'Buses (no menu entry)' : MISSING_VALUE;
}

/** Whether an agency has anything beyond the map, which every agency has: History, Live, Studio, MCP figures or focus status. */
export const hasMoreThanMap = (r: CoverageRow): boolean =>
  r.focus || r.history || r.liveRecorded !== MISSING_VALUE || r.liveRealtime || r.studio !== MISSING_VALUE || r.mcpFigures !== MISSING_VALUE;

/** One row for each agency that has more than the map (CIV-1871, Ryan: every agency is on the map, so the rest is noise). */
export function coverageRows(s: CoverageSources): CoverageRow[] {
  const rows = s.agencies.map(a => {
    const mcp = mcpText(a.slug, s);
    return {
      slug: a.slug,
      name: a.name,
      focus: isFocusAgency(a.slug),
      history: s.historySlugs.includes(a.slug),
      liveRecorded: liveRecordedText(a.slug, s),
      liveRealtime: s.liveMapSlugs.includes(a.slug),
      studio: studioText(a.slug, s),
      mcpFigures: mcp.figures,
      figuresStart: mcp.start,
    };
  });
  const order = (slug: string) => { const i = FOCUS_AGENCY_SLUGS.indexOf(slug); return i < 0 ? Infinity : i; };
  return rows.filter(hasMoreThanMap).sort((a, b) => order(a.slug) - order(b.slug) || a.name.localeCompare(b.name));
}
