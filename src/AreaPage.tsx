import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { DEFAULT_THRESHOLD, agencyPagePath, headwayEvery, headwayOrBetter, modesText } from '../shared/agencyPages';
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
import { StatRow, type StatItem } from './pageParts';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';

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
  const threshold = DEFAULT_THRESHOLD;
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./areaPageDevData').then(m => setData(m.devAreaPageData(params.slug)));
  }, [data, params.slug]);

  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveAreaSeo(data, {
      mode: ATLAS_MODE,
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    }));
  }, [data]);

  if (!data) {
    return (
      <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <SiteHeader />
          <h1 className="mt-24 text-3xl font-black tracking-tight">No page for this area</h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Atlas has no frequency page at this address.</p>
          <a href="/" className={`mt-6 inline-flex items-center gap-2 text-sm font-black ${LINK}`}>Open the Atlas map <ArrowRight className="h-4 w-4" /></a>
        </div>
      </main>
    );
  }

  const within = data.within[String(threshold)] ?? 0;
  const items: StatItem[] = [
    ...(data.typicalWait != null ? [{ value: headwayEvery(data.typicalWait), label: 'typical wait, weekday midday' }] : []),
    ...(data.totalRoutes > 0 ? [{ value: String(data.totalRoutes), label: modesText(data.byMode) }] : []),
  ];

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <SiteHeader />

        <article className="pb-16 pt-10 sm:pt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{areaPageH1(data)}</h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{areaSubtitle(data)}</p>
            </div>
            <a href={areaMapHref(data)} className={PAGE_ACTION}>
              Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          {data.area.note && <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{data.area.note}</p>}

          <StatRow items={items} />

          <section className="mt-14" aria-labelledby="agencies-heading">
            <h2 id="agencies-heading" className="text-xl font-black tracking-tight">Agencies and weekday frequency</h2>
            <p className="mt-3 text-base font-bold">{within} of {data.totalRoutes} routes {headwayOrBetter(threshold)} on a weekday midday</p>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm" style={{ minWidth: `${20 + data.modeColumns.length * 5 + 9}rem` }}>
                <colgroup>
                  <col />
                  {data.modeColumns.map(m => <col key={m} className="w-20" />)}
                  <col className="w-36" />
                </colgroup>
                <thead>
                  <tr className="text-[var(--text-dim)]">
                    <th scope="col" className="py-1.5 pr-4 font-bold">Agency</th>
                    {data.modeColumns.map(m => <th key={m} scope="col" className="py-1.5 pr-4 font-bold">{m}</th>)}
                    <th scope="col" className="py-1.5 font-bold">{headwayOrBetter(threshold).replace(/^e/, 'E')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agencies.map(a => (
                    <tr key={a.slug}>
                      <th scope="row" className="py-1.5 pr-4 font-normal"><a className={`font-black ${LINK}`} href={agencyPagePath(a.slug)}>{a.displayName}</a></th>
                      {data.modeColumns.map(m => <td key={m} className="py-1.5 pr-4">{a.modes[m] ?? '–'}</td>)}
                      <td className="py-1.5">{a.within[String(threshold)] ?? 0} of {a.totalRoutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Mode columns count routes. Each route is judged by its slower direction.</p>
          </section>

          <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">{areaAboutParagraph(data)}</p>
          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). Scheduled service, not live arrivals. {areaDatesText(data)}
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
