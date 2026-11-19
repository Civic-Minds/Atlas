import { FOCUS_AGENCY_SLUGS, PRODUCT_FOCUS, isFocusAgency } from './rules/focus.js';
import { earliestFiguresDay, type LiveCoverage } from './liveCoverage.js';
import { LIVE_MIN_DAYS_TO_SHOW } from './rules/live.js';
import { shortDate } from './dateText.js';
import { MISSING_VALUE } from './missingValue.js';
import { agencyGroupName, groupAgencies } from './agencyGroups.js';

/**
 * The local coverage page's rows (CIV-1871): one per agency on the map, focus agencies first, each column read from
 * the source that decides it (the focus list, History's agency list, Live's archive and map lists, Studio's files,
 * the Live coverage files). Nothing here is typed per agency. Pure, so a test can check it.
 */

export const COVERAGE_COLUMNS = {
  agency: 'Agency',
  focus: 'Focus',
  map: 'Map',
  history: 'History',
  liveRecorded: 'Live recorded',
  liveRealtime: 'Live real-time',
  studio: 'Studio',
  mcpFigures: 'MCP figures',
  figuresStart: 'Figures start',
} as const;

export interface CoverageSources {
  /** The agencies on the map (the public catalog). */
  agencies: ReadonlyArray<{ slug: string; name: string; parentAgency?: string }>;
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
  map: boolean;
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

export function coverageRows(s: CoverageSources): CoverageRow[] {
  const rowOf = (a: { slug: string; name: string }): CoverageRow => {
    const mcp = mcpText(a.slug, s);
    return {
      slug: a.slug,
      name: a.name,
      focus: isFocusAgency(a.slug),
      map: true,
      history: s.historySlugs.includes(a.slug),
      liveRecorded: liveRecordedText(a.slug, s),
      liveRealtime: s.liveMapSlugs.includes(a.slug),
      studio: studioText(a.slug, s),
      mcpFigures: mcp.figures,
      figuresStart: mcp.start,
    };
  };
  // One entry per agency or region (shared/agencyGroups.ts): a parent's feeds are one row under its name. A column is yes
  // when any feed has it; a text column reads the first feed that has a value.
  const groups = groupAgencies(s.agencies);
  const rows = groups.map(g => {
    const parts = g.members.map(rowOf);
    if (!g.parent) return parts[0];
    const text = (k: 'liveRecorded' | 'studio' | 'mcpFigures' | 'figuresStart') => parts.find(r => r[k] !== MISSING_VALUE)?.[k] ?? MISSING_VALUE;
    return {
      slug: g.slug,
      name: agencyGroupName(g, a => a.name),
      focus: parts.some(r => r.focus),
      map: true,
      history: parts.some(r => r.history),
      liveRecorded: text('liveRecorded'),
      liveRealtime: parts.some(r => r.liveRealtime),
      studio: text('studio'),
      mcpFigures: text('mcpFigures'),
      figuresStart: text('figuresStart'),
    };
  });
  // A parent row sits where its earliest focus feed would.
  const focusAt = (slug: string) => { const i = FOCUS_AGENCY_SLUGS.indexOf(slug); return i < 0 ? Infinity : i; };
  const orderBySlug = new Map(groups.map(g => [g.slug, Math.min(...g.members.map(m => focusAt(m.slug)))]));
  const order = (r: CoverageRow) => orderBySlug.get(r.slug) ?? Infinity;
  return rows.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}
