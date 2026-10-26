import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { agencyPagePath } from '../shared/agencyPages';
import {
  AREA_DATA_SCRIPT_ID,
  AREA_TABLE_OTHER,
  areaAboutParagraph,
  areaDatesText,
  areaMapHref,
  areaPageH1,
  areaSubtitle,
  resolveAreaSeo,
  type AreaAgencyRow,
  type AreaPageData,
} from '../shared/areaPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { LINK } from './pageStyles';
import { FrequencyBar } from './pageParts';
import DocsPageLayout from './components/ui/DocsPageLayout';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import EmptyPage from './components/ui/EmptyPage';
import DataTable from './components/ui/DataTable';

/** Desktop widths of the agency table: the names' smallest width, and each mode column's (eight fit in the page). */
const AREA_NAME_COLUMN_REM = 10.75;
const AREA_MODE_COLUMN_REM = 6.75;
/**
 * With the eighth ("Other") column the names column is narrow, so a full name past this length would wrap to three lines
 * or more ("San Francisco Bay Area Water Emergency Transportation Authority (WETA)"); it shows the short display name
 * instead, with the full name on hover. Names this long or shorter fit on two lines.
 */
const NARROW_NAME_MAX_CHARS = 40;

/** A mode header too long for its column breaks after the slash ("Gondola/" over "aerial tram"); the rest stay on one line. */
function modeHeader(label: string) {
  const slash = label.indexOf('/');
  return label.length > 14 && slash > 0 ? <>{label.slice(0, slash + 1)}<br />{label.slice(slash + 1)}</> : label;
}

/** The agency's link in the table: its full name, or in a narrow names column a short one with the full name on hover. */
function agencyNameLink(a: AreaAgencyRow, narrow: boolean) {
  const short = narrow && a.name.length > NARROW_NAME_MAX_CHARS && a.displayName.length < a.name.length;
  return <a className={`font-black ${LINK}`} href={agencyPagePath(a.slug)} title={short ? a.name : undefined}>{short ? a.displayName : a.name}</a>;
}

/** Read this page's numbers from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(slug: string | undefined): AreaPageData | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = document.getElementById(AREA_DATA_SCRIPT_ID)?.textContent;
    const data = raw ? (JSON.parse(raw) as AreaPageData) : null;
    return data && data.area.slug === slug ? data : null;
  } catch {
    return null;
  }
}

/** One metro area: its agencies side by side, with the numbers added up from the agency pages. */
export default function AreaPage({ data: dataProp }: { data?: AreaPageData }) {
  const params = useParams();
  const [data, setData] = useState<AreaPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
  // Not found is only shown once the lookup has finished; until then the page is blank, never a 404 flash.
  const [lookedUp, setLookedUp] = useState(() => !!data || !import.meta.env.DEV);
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./areaPageDevData').then(m => { setData(m.devAreaPageData(params.slug)); setLookedUp(true); });
  }, [data, params.slug]);

  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveAreaSeo(data, {
      mode: ATLAS_MODE,
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    }));
  }, [data]);

  if (!data && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

  if (!data) {
    return (
      <EmptyPage title="No page for this region" body="Atlas has no frequency page at this address." action={<ArrowLink href="/">Open the Atlas map</ArrowLink>} />
    );
  }


  return (
    <DocsPageLayout width="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PageTitle>{areaPageH1(data)}</PageTitle>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{areaSubtitle(data)}</p>
            </div>
            <ArrowLink href={areaMapHref(data)}>View on map</ArrowLink>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{areaAboutParagraph(data)}</p>
          {data.area.note && <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{data.area.note}</p>}

          <section className="mt-14" aria-labelledby="agencies-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <SectionTitle id="agencies-heading">Agencies and weekday frequency</SectionTitle>
              <ArrowLink href="/agencies">See all agencies</ArrowLink>
            </div>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={data.bands} mapHref={areaMapHref(data)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this area's routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            <div className="mt-6 -mx-2 overflow-x-auto">
                <DataTable
                  caption="Agencies and route counts by mode"
                  fixed
                  endAligned
                  rowHref={a => agencyPagePath(a.slug)}
                  rows={data.agencies}
                  rowKey={a => a.slug}
                  columns={[
                    // Every area has the same mode columns (CIV-973); from sm up they are narrow enough for eight to fit beside the names.
                    { key: 'agency', header: 'Agency', rowHeader: true, width: AREA_NAME_COLUMN_REM, className: 'font-normal', cell: a => agencyNameLink(a, data.modeColumns.includes(AREA_TABLE_OTHER)) },
                    ...data.modeColumns.map(m => ({ key: m, header: modeHeader(m), width: AREA_MODE_COLUMN_REM, cell: (a: (typeof data.agencies)[number]) => a.modes[m] ?? '–' })),
                  ]}
                />
            </div>
          </section>

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). {areaDatesText(data)}
          </p>
    </DocsPageLayout>
  );
}
