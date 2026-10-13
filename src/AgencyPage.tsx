import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  agencyAboutParagraph,
  bestRoute,
  DEFAULT_THRESHOLD,
  modesText,
  typicalWait,
  weekendLabel,
  type Threshold,
  agencyDatesText,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencySpanShort,
  agencyStats,
  headwayEvery,
  headwayOrBetter,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  type AgencyPageData,
} from '../shared/agencyPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { LINK, PILL_BUTTON } from './pageStyles';
import { StatRow, ThresholdToggle, type StatItem } from './pageParts';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';

/** Read this page's numbers from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(slug: string | undefined): AgencyPageData | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = document.getElementById(AGENCY_DATA_SCRIPT_ID)?.textContent;
    const data = raw ? (JSON.parse(raw) as AgencyPageData) : null;
    return data && data.agency.slug === slug ? data : null;
  } catch {
    return null;
  }
}

/**
 * One agency's frequency summary, written to be read and crawled as plain text. The prerender
 * passes `data`; in the browser the page reads only its own agency's numbers from its own HTML,
 * so no other agency's data ships with the page. The dev server has no prerendered HTML and
 * loads from the full summary file instead (dead code in production builds).
 */
/** A period cell: the card's cadence, "Limited" when the route runs but has no trustworthy cadence, else a dash. */
function cell(v: number | null, r: { limited?: boolean }): string {
  return v != null ? headwayEvery(v) : r.limited ? 'Limited' : headwayEvery(null);
}

export default function AgencyPage({ data: dataProp }: { data?: AgencyPageData }) {
  const params = useParams();
  const [data, setData] = useState<AgencyPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
  const [threshold, setThreshold] = useState<Threshold>(DEFAULT_THRESHOLD);
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./agencyPageDevData').then(m => setData(m.devAgencyPageData(params.slug)));
  }, [data, params.slug]);
  const agency = data?.agency;

  useEffect(() => {
    if (!agency) return;
    applySeoToDocument(document, resolveAgencySeo(agency, {
      mode: ATLAS_MODE,
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    }));
  }, [agency]);

  if (!agency) {
    return (
      <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <SiteHeader />
          <h1 className="mt-24 text-3xl font-black tracking-tight">No page for this agency</h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Atlas has no frequency page at this address.</p>
          <a href="/" className={`mt-6 inline-flex items-center gap-2 text-sm font-black ${LINK}`}>Open the Atlas map <ArrowRight className="h-4 w-4" /></a>
        </div>
      </main>
    );
  }

  const stats = agencyStats(agency, threshold);
  const wait = typicalWait(agency.routes);
  const best = bestRoute(agency.routes);
  const hours = agencySpanShort(agency);
  const weekend = weekendLabel(agency.sat, agency.sun);
  const nearby = data!.nearby;
  const items: StatItem[] = [
    ...(wait != null ? [{ value: headwayEvery(wait), label: 'typical wait, weekday midday' }] : []),
    ...(best ? [{ value: headwayEvery(best.headway), label: `quickest route: ${best.route.name}` }] : []),
    ...(hours ? [{ value: hours, label: ['weekday service', weekend].filter(Boolean).join(' · ') }] : []),
    ...(stats.totalRoutes > 0 ? [{ value: String(stats.totalRoutes), label: modesText(stats.byMode.map(m => ({ label: m.label, routes: m.routes.length }))) }] : []),
  ];

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <SiteHeader />

        <article className="pb-16 pt-10 sm:pt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{agencyPageH1(agency)}</h1>
              {data!.area && <a className={`mt-1 inline-block text-sm ${LINK}`} href={`/area/${data!.area.slug}`}>{data!.area.name} area →</a>}
            </div>
            <a href={agencyMapHref(agency)} className={PILL_BUTTON}>
              Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <StatRow items={items} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Agencies define frequent differently; pick a standard. <a className={LINK} href="/about/docs#frequency">Methodology</a>
            </p>
            <div className="mt-3"><ThresholdToggle value={threshold} onChange={setThreshold} /></div>
            <p className="mt-3 text-base font-bold">{stats.within} of {stats.totalRoutes} routes {headwayOrBetter(threshold)} on a weekday midday</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Each route is judged by its slower direction. A dash means no sustained service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[30rem] table-fixed border-collapse text-left text-sm">
                  <colgroup><col /><col className="w-28" /><col className="w-28" /><col className="w-28" /></colgroup>
                  <caption className="pb-2 text-left text-base font-black">{group.label} routes ({group.routes.length})</caption>
                  <thead>
                    <tr className="text-[var(--text-dim)]">
                      <th scope="col" className="py-1.5 pr-4 font-bold">Route</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">AM peak</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">Midday</th>
                      <th scope="col" className="py-1.5 font-bold">PM peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.routes.map(r => (
                      <tr key={`${r.name}-${r.longName ?? ''}`}>
                        <th scope="row" className="py-1.5 pr-4 font-normal"><span className="font-black">{r.name}</span>{r.longName && r.longName !== r.name ? <span className="text-[var(--text-muted)]"> {r.longName}</span> : null}</th>
                        {r.night
                          ? <td colSpan={3} className="py-1.5 text-[var(--text-muted)]">Night only</td>
                          : <>
                              <td className="py-1.5 pr-4">{cell(r.am, r)}</td>
                              <td className="py-1.5 pr-4">{cell(r.midday, r)}</td>
                              <td className="py-1.5">{cell(r.pm, r)}</td>
                            </>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">{agencyAboutParagraph(agency)}</p>
          <p className="mt-3 text-sm text-[var(--text-dim)]">{agencyDatesText(agency, data!.releaseDate)}</p>

          {nearby.length > 0 && (
            <section className="mt-12" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-xl font-black tracking-tight">
                {data!.area ? <>Other agencies in the <a className="underline underline-offset-2" href={`/area/${data!.area.slug}`}>{data!.area.name} area</a></> : 'Nearby agencies'}
              </h2>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><a className={`${LINK} underline underline-offset-2`} href={agencyPagePath(o.slug)}>{o.displayName.replace(/\s*\([^)]*\)\s*$/, '')}</a></li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Scheduled service, not live arrivals.
            {agency.websiteUrl && <> Official site: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{agency.name}</a>.</>}
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
