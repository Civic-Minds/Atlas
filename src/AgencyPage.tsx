import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import {
  bandCounts,
  agencyDatesText,
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
import PageShell from './components/ui/PageShell';
import DataTable from './components/ui/DataTable';
import { applySeoToDocument } from './lib/seoDom';
import { titleCase } from './utils/format';
import { LINK, PAGE_ACTION } from './pageStyles';
import { FrequencyBar } from './pageParts';
import SiteFooter from './components/SiteFooter';

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
/** The intro sentence, once, under the title: connecting agencies named in it are links when they have a page. */
function Intro({ intro, connections }: { intro: string; connections: AgencyPageData['connections'] }) {
  const at = intro.indexOf(CONNECTS_WITH);
  const { named, others } = connectionNames(connections);
  const sentence = 'mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]';
  if (at < 0 || named.length === 0) return <p className={sentence}>{intro}</p>;
  return (
    <p className={sentence}>
      {intro.slice(0, at)} and <span title="Another agency's stop within 150 m of one of this agency's stops" className="underline decoration-dotted underline-offset-2">connects with</span>{' '}
      {named.map((c, i) => (
        <span key={c.slug}>
          {i > 0 ? (i === named.length - 1 && others === 0 ? ' and ' : ', ') : ''}
          {c.page ? <a className={`${LINK} underline underline-offset-2`} href={agencyPagePath(c.slug)}>{c.name}</a> : c.name}
        </span>
      ))}
      {others > 0 ? ` and ${others} ${others === 1 ? 'other' : 'others'}` : ''}.
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
      <PageShell variant="wide">
          <h1 className="mt-24 text-3xl font-black tracking-tight">No page for this agency</h1>
          <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">Atlas has no frequency page at this address.</p>
          <a href="/" className={`mt-6 inline-flex items-center gap-2 text-sm font-black ${LINK}`}>Open the Atlas map <ArrowRight className="h-4 w-4" /></a>
      </PageShell>
    );
  }

  const stats = agencyStats(agency);
  const nearby = data!.nearby;

  return (
    <PageShell variant="wide">

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
          <Intro intro={data!.intro} connections={data!.connections} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <h2 id="routes-heading" className="text-xl font-black tracking-tight">Routes and weekday frequency</h2>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={bandCounts(agency.routes)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Each route is judged by its slower direction. A dash means no sustained service in that period.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-8 overflow-x-auto">
                <h3 className="pb-2 text-base font-black" aria-hidden="true">{group.label} routes ({group.routes.length})</h3>
                <div className="min-w-[44rem]">
                  <DataTable
                    caption={`${group.label} routes (${group.routes.length})`}
                    rows={group.routes}
                    rowKey={r => `${r.name}-${r.longName ?? ''}`}
                    columns={[
                      { key: 'route', header: 'Route', rowHeader: true, className: 'font-normal', cell: r => <><span className="font-black">{titleCase(r.name)}</span>{r.longName && r.longName !== r.name ? <span className="text-[var(--text-muted)]"> {titleCase(r.longName)}</span> : null}</> },
                      { key: 'am', header: 'AM peak', cell: r => cell('am', r) },
                      { key: 'midday', header: 'Midday', cell: r => cell('midday', r) },
                      { key: 'pm', header: 'PM peak', cell: r => cell('pm', r) },
                      { key: 'evening', header: 'Evening', cell: r => cell('evening', r) },
                      { key: 'overnight', header: 'Overnight', cell: r => cell('overnight', r) },
                    ]}
                  />
                </div>
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

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Scheduled service, not live arrivals. {agencyDatesText(agency, data!.releaseDate)}
            {agency.websiteUrl && <> Official site: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{agency.name}</a>.</>}
          </p>
        </article>

        <SiteFooter />
    </PageShell>
  );
}
