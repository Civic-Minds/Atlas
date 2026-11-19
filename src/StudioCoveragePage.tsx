import { useEffect, useMemo, useState } from 'react';
import AtlasLogo from './components/AtlasLogo';
import Pill from './components/ui/Pill';
import DataTable, { type DataTableColumn } from './components/ui/DataTable';
import { FLOATING_CARD } from './styles';
import { LOADING_LABEL } from './content/noticeCopy';
import { BACK_PLACES, backLinkLabel } from './content/backLinks';
import { useAgencies } from './hooks/useAgencies';
import { PAGE_NAMES } from '../shared/pageNames';
import { MISSING_VALUE } from '../shared/missingValue';
import { LIVE_AGENCY_SLUGS } from '../shared/livePollingConfig';
import { LIVE_ARCHIVE_SLUGS, type LiveCoverage } from '../shared/liveCoverage';
import { STUDIO_COVERAGE_DEV_URL } from '../shared/studioAgencies';
import { COVERAGE_COLUMNS as H, coverageRows, type CoverageRow } from '../shared/coverageRows';
import historyAgencyList from '../shared/data/history-agencies.json';
import { agencyNames } from './utils/agencyName';

interface LocalFacts { studio: string[]; vehicles: string[]; coverage: Record<string, LiveCoverage> }

const yes = (v: boolean) => (v ? 'Yes' : MISSING_VALUE);

const COLUMNS: DataTableColumn<CoverageRow>[] = [
  { key: 'name', header: H.agency, rowHeader: true, cell: r => r.name },
  { key: 'focus', header: H.focus, cell: r => yes(r.focus) },
  { key: 'map', header: H.map, cell: r => yes(r.map) },
  { key: 'history', header: H.history, cell: r => yes(r.history) },
  { key: 'liveRecorded', header: H.liveRecorded, cell: r => r.liveRecorded },
  { key: 'liveRealtime', header: H.liveRealtime, cell: r => yes(r.liveRealtime) },
  { key: 'studio', header: H.studio, cell: r => r.studio },
  { key: 'mcpFigures', header: H.mcpFigures, cell: r => r.mcpFigures },
  { key: 'figuresStart', header: H.figuresStart, cell: r => r.figuresStart },
];

/**
 * CIV-1871: one row per agency on the map, focus agencies first, and what each product has for it. Local only
 * (FEATURES.studio, the dev server): every column comes from a shared source (shared/coverageRows.ts), the Studio and Live
 * coverage columns from files on this Mac that the dev server lists.
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

  const rows = useMemo(() => coverageRows({
    agencies: agencies.map(a => ({ slug: a.slug, name: agencyNames(a).name, parentAgency: a.parentAgency })),
    historySlugs: (historyAgencyList as { slugs: string[] }).slugs,
    liveArchiveSlugs: LIVE_ARCHIVE_SLUGS,
    liveMapSlugs: LIVE_AGENCY_SLUGS,
    studioSlugs: facts?.studio ?? [],
    vehiclesSlugs: facts?.vehicles ?? [],
    coverage: facts?.coverage ?? {},
    today: new Date().toISOString().slice(0, 10),
  }), [agencies, facts]);

  return (
    <div className="min-h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans">
      <div className="sticky top-0 z-10 bg-[var(--bg-app)]/95 backdrop-blur-md border-b border-[var(--border-primary)] px-6 py-4 flex items-center gap-2">
        <AtlasLogo href="/" ariaLabel={backLinkLabel(BACK_PLACES.frequencyMap)} />
        <span className="w-px h-4 bg-[var(--border-primary)] shrink-0 ml-1" aria-hidden="true" />
        <span className="text-xl sm:text-2xl font-black text-[var(--text-primary)] leading-none">{PAGE_NAMES.studioCoverage}</span>
      </div>
      <div className="p-6">
        {agenciesLoadState === 'loading' ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-dim)] text-sm">{LOADING_LABEL}</div>
        ) : agenciesLoadState === 'error' ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm text-[var(--text-dim)]">
            <p>Could not load agency data.</p>
            <Pill tone="outline" size="segment" onClick={retry}>Retry</Pill>
          </div>
        ) : (
          <>
            {factsFailed && <p className="text-sm text-[var(--text-dim)] mb-3">The dev server didn’t list the Studio and Live files, so those columns are empty.</p>}
            <div className={`${FLOATING_CARD} overflow-hidden`}>
              <div className="overflow-x-auto">
                <DataTable variant="card" columns={COLUMNS} rows={rows} rowKey={r => r.slug} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
