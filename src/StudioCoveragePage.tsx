import { useEffect, useMemo, useState } from 'react';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable, PAGE_SECTION_NOTE } from './components/ui/PageSection';
import DataTable, { PAGE_FIGURE_COLUMN_REM, type DataTableColumn } from './components/ui/DataTable';
import AppLink from './components/ui/AppLink';
import PageLoadState from './components/ui/PageLoadState';
import { redistributionExclusion } from '../shared/rules/redistribution';
import TagList, { type TagListItem } from './components/ui/TagList';
import ProgressBar from './components/ui/ProgressBar';
import { LINK } from './pageStyles';
import { useAgencies } from './hooks/useAgencies';
import { PAGE_NAMES } from '../shared/pageNames';
import { FEATURES } from '../shared/config';
import { LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig';
import { LIVE_ARCHIVE_SLUGS, type LiveCoverage } from '../shared/liveCoverage';
import { STUDIO_COVERAGE_DEV_URL } from '../shared/studioAgencies';
import { LIVE_STUDIO_AGENCIES_URL } from '../shared/liveStudioAgencies';
import { useDevFile } from './apps/studio/useDevFile';
import { agencyPagePath, historyAgencyPath, liveMapAgencyPath } from '../shared/pagePaths';
import { liveAgencyPath } from './hooks/useLiveDashboard';
import { studioPath } from '../shared/studioAgencies';
import { coverageRows, MCP_COVERAGE_API_URL, type CoverageRow } from '../shared/coverageRows';
import historyAgencyList from '../shared/data/history-agencies.json';
import { COVERAGE_COLUMNS as H, COVERAGE_HISTORY as HY, COVERAGE_LIVE_PROGRESS as LP, COVERAGE_LIVE_TAGS as L, COVERAGE_MCP_TAGS as M, COVERAGE_STUDIO_TAGS as S, COVERAGE_TEXT as T } from './content/noticeCopy';
import { agencyNames } from './utils/agencyName';

/** Days recorded per agency and the minimum to be listed on Studio's Live page (local-api/live-studio-agencies.ts). */
export interface LiveDays { minDays: number; days: Record<string, number> }

interface LocalFacts { historyYears?: Record<string, number>; studio: string[]; vehicles: string[]; coverage: Record<string, LiveCoverage> }

const WIDE = PAGE_FIGURE_COLUMN_REM + 2;
/** CIV-3190 (Ryan: "should this be 2 lines so its less wide"): room for two tags a line, so Live's four sit on two lines
 * and Studio's two on one; the shared TagList wraps the rest inside the column. */
const TWO_TAG_COLUMN_REM = WIDE + 6;

type CoveragePill = TagListItem;

const historyPills = (r: CoverageRow): CoveragePill[] => {
  const to = historyAgencyPath(r.slug);
  return r.history ? [{ label: HY.public, to }] : r.historyYears > 0 ? [{ label: HY.years(r.historyYears), to }] : [];
};
// CIV-2205: "Lateness" while lateness is recorded and computed for the agency: it has Live route analyses (each carries the
// on-time figures, LIVE_METHOD.md), the same files as the days-recorded bar; it opens the agency on Studio's Live page.
export const livePills = (r: CoverageRow, live: LiveDays | null): CoveragePill[] => [
  ...(r.liveRecorded ? [{ label: L.recorded, to: liveMapAgencyPath(r.slug) }] : []),
  ...(r.liveRealtime ? [{ label: L.realtime, to: liveMapAgencyPath(r.slug) }] : []),
  ...(r.liveReport ? [{ label: L.report, to: liveAgencyPath(r.slug) }] : []),
  ...(live?.days[r.slug] != null ? [{ label: L.lateness, to: studioPath({ page: 'live', agency: r.slug, route: null }) }] : []),
];
const studioPills = (r: CoverageRow): CoveragePill[] => [
  ...(r.studioSchedule ? [{ label: S.schedule, to: studioPath({ page: 'schedules', agency: r.slug, route: null }) }] : []),
  ...(r.studioVehicles ? [{ label: S.vehicles, to: studioPath({ page: 'fleet', agency: r.slug, route: null }) }] : []),
];
// Schedule answers are universal, like the map, so they aren't listed; real-time answers are none today (CIV-1870).
// CIV-1993: "Live" only once the MCP answers Live questions; before that the cell is the table's dash, no "Live from" date.
// CIV-2121: an agency whose terms bar serving its data to other tools reads "Removed", with the reason on hover.
const mcpPills = (r: CoverageRow): CoveragePill[] => {
  const excluded = redistributionExclusion(r.slug);
  if (excluded) return [{ label: M.removed, title: excluded.reason }];
  return r.mcpLive === 'ready' ? [{ label: M.live }] : [];
};

// CIV-2173: each agency with Live recordings analysed shows its days recorded against the minimum to be listed.
const liveCell = (r: CoverageRow, live: LiveDays | null) => {
  const days = live?.days[r.slug];
  return (
    <>
      <TagList tags={livePills(r, live)} />
      {live && days != null && <div className="mt-1 flex justify-end"><ProgressBar value={days} max={live.minDays} label={LP.label}>{LP.days(days, live.minDays)}</ProgressBar></div>}
    </>
  );
};

const columns = (live: LiveDays | null): DataTableColumn<CoverageRow>[] => [
  { key: 'name', header: H.agency, rowHeader: true, width: 11, className: 'font-normal', cell: r => <><AppLink className={LINK} to={agencyPagePath(r.slug)}>{r.name}</AppLink>{r.place && <span className="text-[var(--text-muted)]">{' · '}{r.place}</span>}</> },
  { key: 'history', header: H.history, width: PAGE_FIGURE_COLUMN_REM, cell: r => <TagList tags={historyPills(r)} /> },
  // #1816, CIV-3190: two tags a line; Live's four wrap onto two lines, both Studio tags fit one; the MCP column holds one tag.
  { key: 'live', header: H.live, width: TWO_TAG_COLUMN_REM, cell: r => liveCell(r, live) },
  { key: 'studio', header: H.studio, width: TWO_TAG_COLUMN_REM, cell: r => <TagList tags={studioPills(r)} /> },
  { key: 'mcp', header: H.mcp, width: WIDE, cell: r => <TagList tags={mcpPills(r)} /> },
];

function CoverageTable({ rows, caption, live }: { rows: CoverageRow[]; caption: string; live: LiveDays | null }) {
  const cols = useMemo(() => columns(live), [live]);
  return (
    <PageTable>
      <DataTable caption={caption} layout="page" rows={rows} rowKey={r => r.slug} columns={cols} />
    </PageTable>
  );
}

/**
 * CIV-1871: what each agency has beyond the map, on the same content-page layout and table as the agency pages: focus
 * agencies first, then the rest. Local only (FEATURES.studio, the dev server). Every column comes from a shared source
 * (shared/coverageRows.ts), the Studio and Live columns from files on this Mac that the dev server lists.
 */
export default function StudioCoveragePage() {
  const { agencies, agenciesLoadState, retry } = useAgencies();
  const [facts, setFacts] = useState<LocalFacts | null>(null);
  const [factsFailed, setFactsFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(STUDIO_COVERAGE_DEV_URL).then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((f: LocalFacts) => { if (!cancelled) setFacts(f); })
      .catch(() => { if (!cancelled) setFactsFailed(true); });
    return () => { cancelled = true; };
  }, []);
  // The mcp-live job's real status, through the local API (read-only keys); where it can't answer, the files on this Mac stand in.
  const [mcpCoverage, setMcpCoverage] = useState<Record<string, LiveCoverage>>({});
  useEffect(() => {
    let cancelled = false;
    fetch(MCP_COVERAGE_API_URL).then(r => (r.ok ? r.json() : null))
      .then((r: { coverage?: Record<string, LiveCoverage> } | null) => { if (!cancelled && r?.coverage) setMcpCoverage(r.coverage); })
      .catch(() => { /* the local API isn't running: the status stays out */ });
    return () => { cancelled = true; };
  }, []);
  const liveFile = useDevFile<LiveDays>(LIVE_STUDIO_AGENCIES_URL);
  const live = liveFile && liveFile !== 'missing' && liveFile.days ? liveFile : null;
  useEffect(() => { document.title = `${PAGE_NAMES.studioCoverage} | Atlas`; }, []);

  const rows = useMemo(() => coverageRows({
    agencies: agencies.map(a => { const n = agencyNames(a).list; return { slug: a.slug, name: n.primary, place: n.secondary, parentAgency: a.parentAgency }; }),
    historySlugs: (historyAgencyList as { slugs: string[] }).slugs,
    historyYears: facts?.historyYears,
    liveArchiveSlugs: LIVE_ARCHIVE_SLUGS,
    // Real-time only where Live itself is on in this build (LIVE_ENABLED) and the agency has a usable Live feed.
    liveMapSlugs: FEATURES.live ? LIVE_AGENCY_SLUGS : [],
    studioSlugs: facts?.studio ?? [],
    vehiclesSlugs: facts?.vehicles ?? [],
    coverage: { ...(facts?.coverage ?? {}), ...mcpCoverage },
    today: new Date().toISOString().slice(0, 10),
  }), [agencies, facts, mcpCoverage]);
  const focus = rows.filter(r => r.focus), others = rows.filter(r => !r.focus);

  return (
    <DocsPageLayout width="wide">
      {agenciesLoadState === 'loading' || agenciesLoadState === 'error' ? (
        <PageLoadState state={agenciesLoadState} what="the agencies" onRetry={retry} />
      ) : (
        <>
          {factsFailed && <p className={`mt-6 ${PAGE_SECTION_NOTE}`}>{T.factsFailed}</p>}
          <PageSection id="coverage-focus" title={T.focusHeading}>
            <CoverageTable rows={focus} caption={T.focusHeading} live={live} />
          </PageSection>
          {others.length > 0 && (
            <PageSection id="coverage-others" title={T.othersHeading}>
              <CoverageTable rows={others} caption={T.othersHeading} live={live} />
            </PageSection>
          )}
        </>
      )}
    </DocsPageLayout>
  );
}
