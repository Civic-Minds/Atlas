import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  agencyAboutParagraph,
  agencyBreadcrumbs,
  agencyDatesText,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencySpanShort,
  agencyStats,
  FREQUENT_MINUTES,
  headwayEvery,
  headwayOrBetter,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  type AgencyPageData,
} from '../shared/agencyPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { SURFACE } from './styles';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';

/** The app's panel surface (SURFACE) as a rounded card, without FLOATING_CARD's shadow. */
const TILE = `min-w-0 rounded-2xl p-4 ${SURFACE}`;
/** Selected pill over a page: identical to CONTROL_ACTIVE_GLASS on fix/selected-state-tokens (opaque panel base with the selected tint on top). Switch to that export once it is on main. */
const CONTROL_ACTIVE_GLASS = 'bg-[var(--bg-panel)] [background-image:linear-gradient(var(--control-active-bg),var(--control-active-bg))] border-[var(--control-active-border)] text-[var(--control-active-fg)]';
/** Unselected pill: the faint grey the app uses only for unselected controls (CONTROL_INACTIVE, no hover). */
const CHIP = 'rounded-full border bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] px-2.5 py-0.5 text-xs font-bold';
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
  const span = agencySpanShort(agency);
  const crumbs = agencyBreadcrumbs(agency);
  const nearby = data!.nearby;
  const standard = headwayOrBetter(FREQUENT_MINUTES);

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <SiteHeader />

        <article className="pb-16 pt-10 sm:pt-14">
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--text-dim)]">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.name}-${i}`}>
                {i > 0 && <span aria-hidden="true"> › </span>}
                {c.href ? <a className="hover:underline" href={c.href}>{c.name}</a> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.name}</span>}
              </Fragment>
            ))}
          </nav>

          <p className="mt-8 text-sm font-semibold text-[var(--text-muted)]">Frequency map</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{agencyPageH1(agency)}</h1>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile value={`${stats.frequentMidday} / ${stats.totalRoutes}`} label={`routes ${standard}, weekday midday`} />
            <Tile value={`${stats.frequentAm} · ${stats.frequentPm}`} label="AM / PM peak, same standard" />
            <Tile value={span ?? 'Not recorded'} label="weekday service" />
            <div className={TILE}>
              <div className="flex flex-wrap gap-1.5">
                {stats.byMode.map(m => (
                  <span key={m.mode} className={CHIP}>
                    {m.routes.length} {m.label.toLowerCase()}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">routes by mode</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href={agencyMapHref(agency)}
              className={`inline-flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-bold ${CONTROL_ACTIVE_GLASS}`}
            >
              Open in the map <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a className={`text-sm font-bold ${LINK}`} href="/about/docs#frequency">Methodology</a>
          </div>
          <p className="mt-4 text-sm text-[var(--text-dim)]">{agencyDatesText(agency, data!.releaseDate)}</p>

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Each route is judged by its slower direction. A dash means no sustained service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-8">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="pb-2 text-left text-base font-black">{group.label} routes ({group.routes.length})</caption>
                  <thead>
                    <tr className="text-[var(--text-dim)]">
                      <th scope="col" className="py-1.5 pr-4 font-bold">Route</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">Midday</th>
                      <th scope="col" className="py-1.5 pr-4 font-bold">AM peak</th>
                      <th scope="col" className="py-1.5 font-bold">PM peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.routes.map(r => (
                      <tr key={`${r.name}-${r.longName ?? ''}`}>
                        <th scope="row" className="py-1.5 pr-4 font-normal"><span className="font-black">{r.name}</span>{r.longName && r.longName !== r.name ? <span className="text-[var(--text-muted)]"> {r.longName}</span> : null}</th>
                        <td className="py-1.5 pr-4">{headwayEvery(r.midday)}</td>
                        <td className="py-1.5 pr-4">{headwayEvery(r.am)}</td>
                        <td className="py-1.5">{headwayEvery(r.pm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <p className="mt-10 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">{agencyAboutParagraph(agency)}</p>

          {nearby.length > 0 && (
            <section className="mt-12" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-xl font-black tracking-tight">Nearby agencies</h2>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><a className={LINK} href={agencyPagePath(o.slug)}>{o.displayName}</a></li>
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

/** A flat stat tile: a big number over a short plain label. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className={TILE}>
      <p className="whitespace-nowrap text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}
