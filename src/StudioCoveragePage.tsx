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
import { LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig';
import { LIVE_ARCHIVE_SLUGS, type LiveCoverage } from '../shared/liveCoverage';
import { STUDIO_COVERAGE_DEV_URL } from '../shared/studioAgencies';
import { agencyPagePath } from '../shared/pagePaths';
import { coverageRows, type CoverageRow } from '../shared/coverageRows';
import historyAgencyList from '../shared/data/history-agencies.json';
import { COVERAGE_COLUMNS as H, COVERAGE_LIVE_TAGS as L, COVERAGE_MCP_TAGS as M, COVERAGE_STUDIO_TAGS as S, COVERAGE_TEXT as T, loadingText } from './content/noticeCopy';
import { agencyNames } from './utils/agencyName';

interface LocalFacts { studio: string[]; vehicles: string[]; coverage: Record<string, LiveCoverage> }

const WIDE = PAGE_FIGURE_COLUMN_REM + 2;

/** A cell that lists what applies as the agencies page's small tags; a dash when nothing does. */
function TagCell({ tags }: { tags: readonly string[] }) {
  return tags.length === 0
    ? <>{MISSING_VALUE}</>
    : <span className="inline-flex flex-wrap justify-end gap-1">{tags.map(t => <Tag key={t} size="inline">{t}</Tag>)}</span>;
}

const liveTags = (r: CoverageRow) => [
  ...(r.liveRecorded === 'recording' ? [L.recorded] : r.liveRecorded === 'paused' ? [L.paused] : []),
  ...(r.liveRealtime ? [L.realtime] : []),
];
const studioTags = (r: CoverageRow) => [...(r.studioSchedule ? [S.schedule] : []), ...(r.studioVehicles ? [S.vehicles] : [])];
// Every agency on the map has the MCP's schedule answers; real-time answers are none today (CIV-1870).
const mcpTags = (r: CoverageRow) => [
  M.schedule,
  ...(r.mcpLive === 'ready' ? [M.live] : r.mcpLive === 'from' ? [M.liveFrom(r.mcpLiveFrom)] : r.mcpLive === 'paused' ? [M.livePaused] : r.mcpLive === 'unread' ? [M.liveUnread] : []),
];

const COLUMNS: DataTableColumn<CoverageRow>[] = [
  { key: 'name', header: H.agency, rowHeader: true, width: 11, className: 'font-normal', cell: r => <AppLink className={LINK} to={agencyPagePath(r.slug)}>{r.name}</AppLink> },
  { key: 'history', header: H.history, width: PAGE_FIGURE_COLUMN_REM, cell: r => (r.history ? 'Yes' : MISSING_VALUE) },
  { key: 'live', header: H.live, width: WIDE + 4, cell: r => <TagCell tags={liveTags(r)} /> },
  { key: 'studio', header: H.studio, width: WIDE + 2, cell: r => <TagCell tags={studioTags(r)} /> },
  { key: 'mcp', header: H.mcp, width: WIDE + 6, cell: r => <TagCell tags={mcpTags(r)} /> },
];

function CoverageTable({ rows, caption }: { rows: CoverageRow[]; caption: string }) {
  return (
    <PageTable linkedRows>
      <DataTable caption={caption} layout="page" rowHref={r => agencyPagePath(r.slug)} rows={rows} rowKey={r => r.slug} columns={COLUMNS} />
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
  useEffect(() => { document.title = `${PAGE_NAMES.studioCoverage} | Atlas`; }, []);

  const rows = useMemo(() => coverageRows({
    agencies: agencies.map(a => ({ slug: a.slug, name: agencyNames(a).name })),
    historySlugs: (historyAgencyList as { slugs: string[] }).slugs,
    liveArchiveSlugs: LIVE_ARCHIVE_SLUGS,
    liveMapSlugs: LIVE_AGENCY_SLUGS,
    studioSlugs: facts?.studio ?? [],
    vehiclesSlugs: facts?.vehicles ?? [],
    coverage: facts?.coverage ?? {},
    today: new Date().toISOString().slice(0, 10),
  }), [agencies, facts]);
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
