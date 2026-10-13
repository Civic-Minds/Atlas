import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { agencyPagePath, headwayOrBetter, FREQUENT_MINUTES } from '../shared/agencyPages';
import {
  AREA_DATA_SCRIPT_ID,
  areaAboutParagraph,
  areaDatesText,
  areaMapHref,
  areaPageH1,
  areaSpanShort,
  areaSubtitle,
  resolveAreaSeo,
  type AreaPageData,
} from '../shared/areaPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { CHIP, LINK, PILL_BUTTON, TILE } from './pageStyles';
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

  const span = areaSpanShort(data);
  const standard = headwayOrBetter(FREQUENT_MINUTES);

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
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <a href={areaMapHref(data)} className={PILL_BUTTON}>
                Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <a className={`text-sm font-bold ${LINK}`} href="/about/docs#frequency">Methodology</a>
            </div>
          </div>
          {data.area.note && <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{data.area.note}</p>}

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile value={`${data.frequentMidday} / ${data.totalRoutes}`} label={`routes ${standard}, weekday midday`} />
            <Tile value={`${data.frequentAm} · ${data.frequentPm}`} label="AM / PM peak, same standard" />
            <Tile value={span ?? 'Not recorded'} label="weekday service" />
            <div className={TILE}>
              <div className="flex flex-wrap gap-1.5">
                {data.byMode.map(m => <span key={m.label} className={CHIP}>{m.routes} {m.label.toLowerCase()}</span>)}
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{data.agencies.length} {data.agencies.length === 1 ? 'agency' : 'agencies'}, routes by mode</p>
            </div>
          </div>

          <section className="mt-14" aria-labelledby="agencies-heading">
            <h2 id="agencies-heading" className="text-xl font-black tracking-tight">Agencies</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {data.agencies.map(a => (
                <li key={a.slug}>
                  <a href={agencyPagePath(a.slug)} className={`block ${TILE} hover:bg-[var(--bg-btn-hover)]`}>
                    <span className="block text-base font-black">{a.displayName}</span>
                    <span className="mt-1 block text-sm text-[var(--text-muted)]">
                      {a.frequentMidday} of {a.totalRoutes} {a.totalRoutes === 1 ? 'route' : 'routes'} {standard}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">{areaAboutParagraph(data)}</p>
          <p className="mt-3 text-sm text-[var(--text-dim)]">{areaDatesText(data)}</p>
          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). Scheduled service, not live arrivals.
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className={TILE}>
      <p className="whitespace-nowrap text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
