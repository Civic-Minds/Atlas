import { useEffect, useMemo, useState } from 'react';
import DocsPageLayout from './components/ui/DocsPageLayout';
import PageSection, { PageTable, PAGE_SECTION_NOTE } from './components/ui/PageSection';
import DataTable, { PAGE_FIGURE_COLUMN_REM, type DataTableColumn } from './components/ui/DataTable';
import AppLink from './components/ui/AppLink';
import Pill from './components/ui/Pill';
import Tag from './components/ui/Tag';
import { LINK } from './pageStyles';
import { useAgencies } from './hooks/useAgencies';
import { PAGE_NAMES } from '../shared/pageNames';
import { MISSING_VALUE } from '../shared/missingValue';
import { FEATURES } from '../shared/config';
import { LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig';
import { LIVE_ARCHIVE_SLUGS, type LiveCoverage } from '../shared/liveCoverage';
import { STUDIO_COVERAGE_DEV_URL } from '../shared/studioAgencies';
import { agencyPagePath, historyAgencyPath, liveMapAgencyPath } from '../shared/pagePaths';
import { liveAgencyPath } from './hooks/useLiveDashboard';
import { studioPath } from '../shared/studioAgencies';
import { coverageRows, MCP_COVERAGE_API_URL, type CoverageRow } from '../shared/coverageRows';
import historyAgencyList from '../shared/data/history-agencies.json';
import { COVERAGE_COLUMNS as H, COVERAGE_HISTORY as HY, COVERAGE_LIVE_TAGS as L, COVERAGE_MCP_TAGS as M, COVERAGE_STUDIO_TAGS as S, COVERAGE_TEXT as T, loadingText } from './content/noticeCopy';
import { agencyNames } from './utils/agencyName';

interface LocalFacts { historyYears?: Record<string, number>; studio: string[]; vehicles: string[]; coverage: Record<string, LiveCoverage> }

const WIDE = PAGE_FIGURE_COLUMN_REM + 2;

/** A pill that opens its view for the agency (pointer and hover as the shared pills), or a plain tag where there is no page to open. */
interface CoveragePill { label: string; to?: string }

/** A cell that lists what applies as the agencies page's small tags, all on one line; a dash when nothing does. */
function TagCell({ pills }: { pills: readonly CoveragePill[] }) {
  return pills.length === 0
    ? <>{MISSING_VALUE}</>
    : <span className="inline-flex flex-nowrap justify-end gap-1 whitespace-nowrap">
        {pills.map(p => p.to
          ? <AppLink key={p.label} to={p.to}><Tag size="inline" className="hover:border-[var(--accent-border)] hover:text-[var(--text-primary)] transition-colors">{p.label}</Tag></AppLink>
          : <Tag key={p.label} size="inline">{p.label}</Tag>)}
      </span>;
}

const historyPills = (r: CoverageRow): CoveragePill[] => {
  const to = historyAgencyPath(r.slug);
  return r.history ? [{ label: HY.public, to }] : r.historyYears > 0 ? [{ label: HY.years(r.historyYears), to }] : [];
};
const livePills = (r: CoverageRow): CoveragePill[] => [
  ...(r.liveRecorded ? [{ label: L.recorded, to: liveMapAgencyPath(r.slug) }] : []),
  ...(r.liveRealtime ? [{ label: L.realtime, to: liveMapAgencyPath(r.slug) }] : []),
  ...(r.liveReport ? [{ label: L.report, to: liveAgencyPath(r.slug) }] : []),
];
const studioPills = (r: CoverageRow): CoveragePill[] => [
  ...(r.studioSchedule ? [{ label: S.schedule, to: studioPath({ page: 'schedules', agency: r.slug, route: null }) }] : []),
  ...(r.studioVehicles ? [{ label: S.vehicles, to: studioPath({ page: 'fleet', agency: r.slug, route: null }) }] : []),
];
// Schedule answers are universal, like the map, so they aren't listed; real-time answers are none today (CIV-1870).
// CIV-1993: "Live" only once the MCP answers Live questions; before that the cell is the table's dash, no "Live from" date.
const mcpPills = (r: CoverageRow): CoveragePill[] => (r.mcpLive === 'ready' ? [{ label: M.live }] : []);

const COLUMNS: DataTableColumn<CoverageRow>[] = [
  { key: 'name', header: H.agency, rowHeader: true, width: 11, className: 'font-normal', cell: r => <><AppLink className={LINK} to={agencyPagePath(r.slug)}>{r.name}</AppLink>{r.place && <span className="text-[var(--text-muted)]">{' · '}{r.place}</span>}</> },
  { key: 'history', header: H.history, width: PAGE_FIGURE_COLUMN_REM, cell: r => <TagCell pills={historyPills(r)} /> },
  { key: 'live', header: H.live, width: WIDE + 6, cell: r => <TagCell pills={livePills(r)} /> },
  { key: 'studio', header: H.studio, width: WIDE + 2, cell: r => <TagCell pills={studioPills(r)} /> },
  { key: 'mcp', header: H.mcp, width: WIDE + 6, cell: r => <TagCell pills={mcpPills(r)} /> },
];

function CoverageTable({ rows, caption }: { rows: CoverageRow[]; caption: string }) {
  return (
    <PageTable>
      <DataTable caption={caption} layout="page" rows={rows} rowKey={r => r.slug} columns={COLUMNS} />
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
      {agenciesLoadState === 'loading' ? (
        <p className="mt-12 text-sm text-[var(--text-dim)]">{loadingText('the agencies')}</p>
      ) : agenciesLoadState === 'error' ? (
        <div className="mt-12 flex flex-col items-start gap-3 text-sm text-[var(--text-dim)]">
          <p>Could not load agency data.</p>
          <Pill tone="outline" size="segment" onClick={retry}>Retry</Pill>
        </div>
      ) : (
        <>
          {factsFailed && <p className={`mt-6 ${PAGE_SECTION_NOTE}`}>{T.factsFailed}</p>}
          <PageSection id="coverage-focus" title={T.focusHeading}>
            <CoverageTable rows={focus} caption={T.focusHeading} />
          </PageSection>
          {others.length > 0 && (
            <PageSection id="coverage-others" title={T.othersHeading}>
              <CoverageTable rows={others} caption={T.othersHeading} />
            </PageSection>
          )}
        </>
      )}
    </DocsPageLayout>
  );
}
