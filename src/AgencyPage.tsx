import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  bandCounts,
  modesText,
  agencyDatesText,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencyStats,
  headwayEvery,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  type AgencyPageData,
  type AgencyPageRoute,
} from '../shared/agencyPages';
import { areaRegionName, areaRegionTitle } from '../shared/areaRegions';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { titleCase } from './utils/format';
import { LINK, PAGE_ACTION } from './pageStyles';
import { FrequencyBar, StatRow, type StatItem } from './pageParts';
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
const MAX_CONNECTION_AGENCIES = 8;
const MAX_CONNECTION_ROUTES = 6;

/** A period cell: the card's cadence, "Limited" when the route runs but has no trustworthy cadence, else a dash. */
function cell(col: 'am' | 'midday' | 'pm' | 'evening' | 'overnight', r: AgencyPageRoute): string {
  const v = r[col];
  return v != null ? headwayEvery(v) : Array.isArray(r.limited) && r.limited.includes(col) ? 'Limited' : headwayEvery(null);
}

export default function AgencyPage({ data: dataProp }: { data?: AgencyPageData }) {
  const params = useParams();
  const [data, setData] = useState<AgencyPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
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
      intro: data?.intro,
    }));
  }, [agency, data?.intro]);

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

  const stats = agencyStats(agency);
  const nearby = data!.nearby;
  const items: StatItem[] = [
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
              {data!.area && <a className={`mt-1 inline-block text-sm ${LINK}`} href={`/area/${data!.area.slug}`}>{areaRegionTitle(data!.area)} →</a>}
            </div>
            <a href={agencyMapHref(agency)} className={PAGE_ACTION}>
              Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <StatRow items={items} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={bandCounts(agency.routes)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Each route is judged by its slower direction. A dash means no sustained service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[44rem] table-fixed border-collapse text-left text-sm">
                  <colgroup><col className="w-64" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-28" /></colgroup>
                  <caption className="pb-2 text-left text-base font-black">{group.label} routes ({group.routes.length})</caption>
                  <thead>
                    <tr className="text-[var(--text-dim)]">
                      <th scope="col" className="py-1.5 pr-4 font-bold">Route</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">AM peak</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">Midday</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">PM peak</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">Evening</th>
                      <th scope="col" className="py-1.5 font-bold">Overnight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.routes.map(r => (
                      <tr key={`${r.name}-${r.longName ?? ''}`}>
                        <th scope="row" className="py-1.5 pr-4 font-normal"><span className="font-black">{titleCase(r.name)}</span>{r.longName && r.longName !== r.name ? <span className="text-[var(--text-muted)]"> {titleCase(r.longName)}</span> : null}</th>
                        <td className="py-1.5 pr-4">{cell('am', r)}</td>
                        <td className="py-1.5 pr-4">{cell('midday', r)}</td>
                        <td className="py-1.5 pr-4">{cell('pm', r)}</td>
                        <td className="py-1.5 pr-4">{cell('evening', r)}</td>
                        <td className="py-1.5">{cell('overnight', r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {data!.connections.length > 0 && (
            <section className="mt-12" aria-labelledby="connects-heading">
              <h2 id="connects-heading" className="text-xl font-black tracking-tight">Connects with</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Routes of other agencies with a stop within 150 m of one of this agency's stops.</p>
              <ul className="mt-4 space-y-2 text-sm leading-6">
                {data!.connections.slice(0, MAX_CONNECTION_AGENCIES).map(c => (
                  <li key={c.slug}>
                    {c.page ? <a className={`font-black underline underline-offset-2 ${LINK}`} href={agencyPagePath(c.slug)}>{c.name}</a> : <span className="font-black">{c.name}</span>}
                    <span className="text-[var(--text-muted)]">: {c.routes.slice(0, MAX_CONNECTION_ROUTES).map(titleCase).join(', ')}{c.routes.length > MAX_CONNECTION_ROUTES ? ` and ${c.routes.length - MAX_CONNECTION_ROUTES} more` : ''}</span>
                  </li>
                ))}
              </ul>
              {data!.connections.length > MAX_CONNECTION_AGENCIES && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">and {data!.connections.length - MAX_CONNECTION_AGENCIES} more agencies</p>
              )}
            </section>
          )}

          <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">{data!.intro}</p>

          {nearby.length > 0 && (
            <section className="mt-12" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-xl font-black tracking-tight">
                {data!.area ? <>Nearby agencies in <a className="underline underline-offset-2" href={`/area/${data!.area.slug}`}>{areaRegionName(data!.area)}</a></> : 'Nearby agencies'}
              </h2>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><a className={`${LINK} underline underline-offset-2`} href={agencyPagePath(o.slug)}>{o.name}</a></li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Scheduled service, not live arrivals. {agencyDatesText(agency, data!.releaseDate)}
            {agency.websiteUrl && <> Official site: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{agency.name}</a>.</>}
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
