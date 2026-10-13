import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  agencyBreadcrumbs,
  agencyLeadSentence,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencySpanText,
  agencyStats,
  FREQUENT_MINUTES,
  formatDataDate,
  headwayEvery,
  headwayOrBetter,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  type AgencyPageData,
} from '../shared/agencyPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';

const LINK = 'text-[var(--accent)] hover:underline';

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

  const stats = agencyStats(agency);
  const updated = formatDataDate(agency.lastRefreshedAt);
  const span = agencySpanText(agency);
  const crumbs = agencyBreadcrumbs(agency);
  const nearby = data!.nearby;
  const statItems: Array<[string, string]> = [
    ['Routes by mode', stats.byMode.map(m => `${m.routes.length} ${m.label.toLowerCase()}`).join(', ')],
    ['Frequent share', `${stats.frequentShare}% of routes run ${headwayOrBetter(FREQUENT_MINUTES)} at midday`],
    ['Midday and peak', `${stats.frequentMidday} at midday, ${stats.frequentAm} in the AM peak, ${stats.frequentPm} in the PM peak run ${headwayOrBetter(FREQUENT_MINUTES)}`],
    ...(span ? [['Weekday service span', span] as [string, string]] : []),
    ['Data as of', updated ?? 'not recorded'],
  ];

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <SiteHeader />

        <article className="pb-16 pt-12 sm:pt-16">
          <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-dim)]">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.name}-${i}`}>
                {i > 0 && <span aria-hidden="true"> › </span>}
                {c.href ? <a className={LINK} href={c.href}>{c.name}</a> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.name}</span>}
              </Fragment>
            ))}
          </nav>

          <h1 className="mt-6 text-3xl font-black tracking-tight sm:text-5xl">{agencyPageH1(agency)}</h1>
          <p className="mt-6 text-lg leading-8 text-[var(--text-muted)]">{agencyLeadSentence(agency)}</p>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={agencyMapHref(agency)}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--control-active-bg)] px-6 text-base font-bold text-[var(--control-active-fg)] transition-colors hover:bg-[var(--control-active-border)]"
            >
              Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a className={`text-base font-bold ${LINK}`} href="/about/docs#frequency">How Atlas measures frequency</a>
          </div>

          <dl className="mt-12 grid gap-x-8 border-y border-[var(--border-primary)] sm:grid-cols-2">
            {statItems.map(([label, value]) => (
              <div key={label} className="border-b border-[var(--border-primary)] py-3 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <dt className="text-sm text-[var(--text-dim)]">{label}</dt>
                <dd className="mt-0.5 text-base font-bold">{value}</dd>
              </div>
            ))}
          </dl>

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Each route is judged by its slower direction. A dash means no sustained service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-8">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="pb-2 text-left text-base font-black">{group.label} routes ({group.routes.length})</caption>
                  <thead>
                    <tr className="border-b border-[var(--border-primary)] text-[var(--text-dim)]">
                      <th scope="col" className="py-2 pr-4 font-bold">Route</th>
                      <th scope="col" className="py-2 pr-4 font-bold">Midday</th>
                      <th scope="col" className="py-2 pr-4 font-bold">AM peak</th>
                      <th scope="col" className="py-2 font-bold">PM peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.routes.map(r => (
                      <tr key={`${r.name}-${r.longName ?? ''}`} className="border-b border-[var(--border-primary)]">
                        <th scope="row" className="py-2 pr-4 font-normal"><span className="font-black">{r.name}</span>{r.longName && r.longName !== r.name ? <span className="text-[var(--text-muted)]"> {r.longName}</span> : null}</th>
                        <td className="py-2 pr-4">{headwayEvery(r.midday)}</td>
                        <td className="py-2 pr-4">{headwayEvery(r.am)}</td>
                        <td className="py-2">{headwayEvery(r.pm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {nearby.length > 0 && (
            <section className="mt-14" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-xl font-black tracking-tight">Nearby agencies</h2>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><a className={LINK} href={agencyPagePath(o.slug)}>{o.displayName}</a></li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-14 text-sm leading-6 text-[var(--text-dim)]">
            Scheduled service, not live arrivals.
            {agency.websiteUrl && <> Official site: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{agency.name}</a>.</>}
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
