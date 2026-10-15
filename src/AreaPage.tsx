import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
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
import { LINK, PAGE_ACTION } from './pageStyles';
import { FrequencyBar } from './pageParts';
import PageShell from './components/ui/PageShell';
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
      <PageShell variant="wide">
          <h1 className="mt-24 text-3xl font-black tracking-tight">No page for this region</h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Atlas has no frequency page at this address.</p>
          <a href="/" className={`mt-6 inline-flex items-center gap-2 text-sm font-black ${LINK}`}>Open the Atlas map <ArrowRight className="h-4 w-4" /></a>
      </PageShell>
    );
  }


  return (
    <PageShell variant="wide">

        <article className="pb-16 pt-10 sm:pt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{areaPageH1(data)}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{areaSubtitle(data)}</p>
            </div>
            <a href={areaMapHref(data)} className={PAGE_ACTION}>
              View on map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{areaAboutParagraph(data)}</p>
          {data.area.note && <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{data.area.note}</p>}

          <section className="mt-14" aria-labelledby="agencies-heading">
            <h2 id="agencies-heading" className="text-xl font-black tracking-tight">Agencies and weekday frequency</h2>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={data.bands} mapHref={areaMapHref(data)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this area's routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            <div className="mt-6 overflow-x-auto">
              <div style={{ minWidth: `${20 + data.modeColumns.length * 5}rem` }}>
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
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Mode columns count routes. A dash means none.</p>
          </section>

          <a href="/agencies" className={`${PAGE_ACTION} mt-6`}>
            See all agencies <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). {areaDatesText(data)}
          </p>
        </article>
    </PageShell>
  );
}
