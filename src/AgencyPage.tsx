import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  bandCounts,
  agencyDatesText,
  introName,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencyStats,
  headwayEvery,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  CONNECTS_WITH,
  connectionNames,
  type AgencyPageData,
  type AgencyPageRoute,
} from '../shared/agencyPages';
import { areaRegionName, areaRegionTitle } from '../shared/areaRegions';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { titleCase } from './utils/format';
import { LINK, PAGE_ACTION } from './pageStyles';
import { FrequencyBar } from './pageParts';
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
/**
 * The intro sentence, once, under the title. The place links to its area page when the agency has one, and connecting
 * agencies named in it are links when they have a page.
 */
function Intro({ data }: { data: AgencyPageData }) {
  const { intro, introLead, place, connections, area } = data;
  const sentence = 'mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]';
  const link = `${LINK} underline underline-offset-2`;
  const placeAt = introLead.length;
  if (!intro.startsWith(introLead) || !intro.startsWith(place, placeAt)) return <p className={sentence}>{intro}</p>;
  const at = intro.indexOf(CONNECTS_WITH, placeAt);
  const { named, others } = connectionNames(connections);
  const between = intro.slice(placeAt + place.length, at < 0 ? intro.length - 1 : at);
  return (
    <p className={sentence}>
      {introLead}
      {area ? <a className={link} href={`/area/${area.slug}`}>{place}</a> : place}
      {between}
      {at >= 0 && named.length > 0 && (
        <>
          {' and connects with '}
          {named.map((c, i) => (
            <span key={c.slug}>
              {i > 0 ? (i === named.length - 1 && others === 0 ? ' and ' : ', ') : ''}
              {c.page ? <a className={link} href={agencyPagePath(c.slug)}>{c.name}</a> : c.name}
            </span>
          ))}
          {others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : ''}
        </>
      )}
      .
    </p>
  );
}

/** A period cell: the card's cadence, "Limited" when the route runs but has no trustworthy cadence, else a dash. */
function cell(col: 'am' | 'midday' | 'pm' | 'evening' | 'overnight', r: AgencyPageRoute): string {
  const v = r[col];
  return v != null ? headwayEvery(v) : Array.isArray(r.limited) && r.limited.includes(col) ? 'Limited' : headwayEvery(null);
}

export default function AgencyPage({ data: dataProp }: { data?: AgencyPageData }) {
  const params = useParams();
  const [data, setData] = useState<AgencyPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
  // Not found is only shown once the lookup has finished; until then the page is blank, never a 404 flash.
  const [lookedUp, setLookedUp] = useState(() => !!data || !import.meta.env.DEV);
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./agencyPageDevData').then(m => { setData(m.devAgencyPageData(params.slug)); setLookedUp(true); });
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

  if (!agency && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

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
          <Intro data={data!} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={bandCounts(agency.routes)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this agency's routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            <p className="mt-8 text-sm leading-6 text-[var(--text-muted)]">A dash means no regular service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[44rem] table-fixed border-collapse text-left text-sm">
                  <colgroup><col className="w-64" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-28" /></colgroup>
                  <caption className="pb-2 text-left text-base font-black">{group.label} routes <span className="ml-1 font-normal text-[var(--text-muted)]">{group.routes.length}</span></caption>
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

          <a href="/agencies" className={`${PAGE_ACTION} mt-6`}>
            See all agencies <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            {agencyDatesText(agency, data!.releaseDate)}
            {agency.websiteUrl && <> Agency website: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{introName(agency.name, agency.city)}</a>.</>}
          </p>
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
