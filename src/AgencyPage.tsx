import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import {
  bandCounts,
  agencyDatesText,
  agencyTitle,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencyStats,
  headwayEvery,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  CONNECTS_WITH,
  NO_MIDDAY_PHRASE,
  connectionNames,
  type AgencyPageData,
  type AgencyPageRoute,
} from '../shared/agencyPages';
import { areaRegionName, areaRegionTitle } from '../shared/areaRegions';
import { AGENCY_INDEX_PATH, agencyIndexRegionHref } from '../shared/agencyIndex';
import { areaPagePath } from '../shared/areas';
import { andOthers } from '../shared/overflowText';
import { routeListHeadwayText } from './utils/effectiveHeadway';
import { ATLAS_MODE, PERIOD_LABELS } from '../shared/config';
import DocsPageLayout from './components/ui/DocsPageLayout';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import EmptyPage from './components/ui/EmptyPage';
import DataTable from './components/ui/DataTable';
import ScrollX from './components/ui/ScrollX';
import { applySeoToDocument, seoOrigin } from './lib/seoDom';
import { readEmbeddedJson } from './lib/embeddedData';
import { LINK, UNDERLINED_LINK } from './pageStyles';
import { FrequencyBar, RouteNameCell } from './pageParts';
import { AGENCY_PAGE_NOT_FOUND_TITLE, LIMITED_SERVICE_LABEL, NO_FREQUENCY_PAGE_BODY, IRREGULAR_PERIOD_SHORT_LABEL } from './content/noticeCopy';
import { capitalizeFirst } from './utils/headwayText';

/** Read this page's numbers from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(slug: string | undefined): AgencyPageData | null {
  const data = readEmbeddedJson<AgencyPageData>(AGENCY_DATA_SCRIPT_ID);
  return data && data.agency.slug === slug ? data : null;
}

/**
 * The intro sentence, once, under the title. The place links to its area page when the agency has one, and otherwise
 * to its state or province in the all-agencies list (CIV-966); connecting agencies named in it are links when they have
 * a page. An agency with no regular midday service says so after it (CIV-965).
 */
function Intro({ data }: { data: AgencyPageData }) {
  const { intro, introLead, place, connections, area } = data;
  const sentence = 'mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]';
  const placeAt = introLead.length;
  const noMidday = data.agency.routes.length > 0 && data.agency.routes.every(r => r.midday == null)
    ? ` ${data.agency.routes.length === 1 ? 'Its route has' : 'Its routes have'} ${NO_MIDDAY_PHRASE.replace(/^with /, '')}.`
    : '';
  const placeHref = area ? areaPagePath(area.slug) : agencyIndexRegionHref(data.agency);
  if (!intro.startsWith(introLead) || !intro.startsWith(place, placeAt)) return <p className={sentence}>{intro}{noMidday}</p>;
  const at = intro.indexOf(CONNECTS_WITH, placeAt);
  const { named, others } = connectionNames(connections);
  const between = intro.slice(placeAt + place.length, at < 0 ? intro.length - 1 : at);
  return (
    <p className={sentence}>
      {introLead}
      {placeHref ? <a className={UNDERLINED_LINK} href={placeHref}>{place}</a> : place}
      {between}
      {at >= 0 && named.length > 0 && (
        <>
          {CONNECTS_WITH}
          {named.map((c, i) => (
            <span key={c.slug}>
              {i > 0 ? (i === named.length - 1 && others === 0 ? ' and ' : ', ') : ''}
              {c.page ? <a className={UNDERLINED_LINK} href={agencyPagePath(c.slug)}>{c.name}</a> : c.name}
            </span>
          ))}
          {others > 0 ? ` ${andOthers(others, 'agency', 'agencies')}` : ''}
        </>
      )}
      .{noMidday}
    </p>
  );
}

/**
 * A period cell: the card's cadence (a range where alternating branches combine on a shared
 * stretch), "Limited" when the route runs but has no trustworthy cadence, "Irregular" where the
 * map list says so (#1249, CIV-1238), else a dash.
 */
function cell(col: 'am' | 'midday' | 'pm' | 'evening' | 'overnight', r: AgencyPageRoute): string {
  const v = r[col];
  if (v != null) return routeListHeadwayText(v, r.shared?.[col], true);
  if (Array.isArray(r.noRegular) && r.noRegular.includes(col)) return IRREGULAR_PERIOD_SHORT_LABEL;
  return Array.isArray(r.limited) && r.limited.includes(col) ? capitalizeFirst(LIMITED_SERVICE_LABEL) : headwayEvery(null);
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
      origin: seoOrigin(),
      intro: data?.intro,
      description: data?.description,
    }));
  }, [agency, data?.intro, data?.description]);

  if (!agency && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

  if (!agency) {
    return (
      <EmptyPage title={AGENCY_PAGE_NOT_FOUND_TITLE} body={NO_FREQUENCY_PAGE_BODY} action={<ArrowLink href="/">Open the Atlas map</ArrowLink>} />
    );
  }

  const stats = agencyStats(agency);
  const nearby = data!.nearby;

  return (
    <DocsPageLayout width="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PageTitle>{data!.title ?? agencyPageH1(agency)}</PageTitle>
              {data!.area
                ? <ArrowLink tone="inline" className="mt-1" href={areaPagePath(data!.area.slug)}>{areaRegionTitle(data!.area)}</ArrowLink>
                : agency.city && <p className="mt-1 text-sm text-[var(--text-muted)]">{agency.city}</p>}
            </div>
            <ArrowLink href={agencyMapHref(agency)}>View on map</ArrowLink>
          </div>
          <Intro data={data!} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <SectionTitle id="routes-heading">Routes and weekday frequency</SectionTitle>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={bandCounts(agency.routes)} mapHref={agencyMapHref(agency)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this agency's routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-4">
                <h3 className="pb-2 text-base font-black" aria-hidden="true">{group.label} <span className="ml-1 font-normal text-[var(--text-muted)]">{group.routes.length}</span></h3>
                <ScrollX>
                  <DataTable
                    caption={`${group.label} ${group.routes.length}`}
                    layout="page"
                    rows={group.routes}
                    rowKey={r => `${r.name}-${r.longName ?? ''}`}
                    columns={[
                      { key: 'route', header: 'Route', rowHeader: true, className: 'font-normal', cell: r => <RouteNameCell shortName={r.name} feedShortName={r.shortName} longName={r.longName} mode={r.mode} agencyName={agency.name} /> },
                      { key: 'am', header: PERIOD_LABELS.amPeak, cell: r => cell('am', r) },
                      { key: 'midday', header: PERIOD_LABELS.midday, cell: r => cell('midday', r) },
                      { key: 'pm', header: PERIOD_LABELS.pmPeak, cell: r => cell('pm', r) },
                      { key: 'evening', header: PERIOD_LABELS.evening, cell: r => cell('evening', r) },
                      { key: 'overnight', header: PERIOD_LABELS.overnight, cell: r => cell('overnight', r) },
                    ]}
                  />
                </ScrollX>
              </div>
            ))}
          </section>

          {nearby.length > 0 && (
            <section className="mt-12" aria-labelledby="nearby-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <SectionTitle id="nearby-heading">
                  {data!.area ? <>Nearby agencies in <a className="underline underline-offset-2" href={areaPagePath(data!.area.slug)}>{areaRegionName(data!.area)}</a></> : 'Nearby agencies'}
                </SectionTitle>
                <ArrowLink href={AGENCY_INDEX_PATH}>See all agencies</ArrowLink>
              </div>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><a className={UNDERLINED_LINK} href={agencyPagePath(o.slug)}>{o.name}</a></li>
                ))}
              </ul>
            </section>
          )}

          {nearby.length === 0 && (
            <ArrowLink href={AGENCY_INDEX_PATH} className="mt-6">See all agencies</ArrowLink>
          )}

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            {agencyDatesText(agency, data!.releaseDate)}
            {agency.websiteUrl && <> Agency website: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{data!.title ?? agencyTitle(agency)}</a>.</>}
          </p>
    </DocsPageLayout>
  );
}
