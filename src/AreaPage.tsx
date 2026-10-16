import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { agencyPagePath } from '../shared/agencyPages';
import {
  AREA_DATA_SCRIPT_ID,
  areaAboutParagraph,
  areaDatesText,
  areaMapHref,
  areaPageH1,
  areaSubtitle,
  resolveAreaSeo,
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
            <div className="mt-6 overflow-x-auto">
                <DataTable
                  caption="Agencies and route counts by mode"
                  fixed
                  rows={data.agencies}
                  rowKey={a => a.slug}
                  columns={[
                    { key: 'agency', header: 'Agency', rowHeader: true, className: 'font-normal', cell: a => <a className={`font-black ${LINK}`} href={agencyPagePath(a.slug)}>{a.name}</a> },
                    ...data.modeColumns.map(m => ({ key: m, header: m, cell: (a: (typeof data.agencies)[number]) => a.modes[m] ?? '–' })),
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
