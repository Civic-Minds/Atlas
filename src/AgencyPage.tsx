import { useEffect, useState } from 'react';
import AppLink from './components/ui/AppLink';
import { MISSING_VALUE } from '../shared/missingValue';
import { useParams } from 'react-router';
import {
  bandCounts,
  agencyDatesText,
  agencyTitle,
  agencyMapHref,
  agencyPageH1,
  agencyPagePath,
  agencyStats,
  resolveAgencySeo,
  AGENCY_DATA_SCRIPT_ID,
  CONNECTS_WITH,
  noMiddayIntroSentence,
  connectionNames,
  PART_OF,
  PLACE_OTHERS,
  type AgencyPageData,
  type AgencyPageRoute,
} from '../shared/agencyPages';
import { areaRegionName, areaSubtitleName } from '../shared/areaRegions';
import { titleCase } from '../shared/titleCase';

/** The nearby-agencies heading's opening; the area's name after it is cased as part of the same title ("in the Calgary Area"). */
const NEARBY_IN = 'Nearby Agencies in ';
import { AGENCY_INDEX_PATH } from '../shared/agencyIndex';
import { areaPagePath } from '../shared/areas';
import { andOthers } from '../shared/overflowText';
import { agencyArticle } from '../shared/agencyArticle';
import { periodEdgeText, routeListHeadwayText } from './utils/effectiveHeadway';
import { ATLAS_MODE, FEATURES, PERIOD_LABELS } from '../shared/config';
import HoursBar from './components/charts/HoursBar';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { AgencyModeTable } from './AgencyGroupSection';
import { parentAgencyPagePath } from '../shared/pagePaths';
import type { ParentAgencyPageData } from '../shared/parentAgencies';
import ArrowLink from './components/ui/ArrowLink';
import { SubsectionTitle, PageTitle, SectionTitle } from './components/ui/PageTitle';
import EmptyPage from './components/ui/EmptyPage';
import DataTable from './components/ui/DataTable';
import ScrollX from './components/ui/ScrollX';
import { applySeoToDocument, seoOrigin } from './lib/seoDom';
import { readEmbeddedJson } from './lib/embeddedData';
import { LINK, UNDERLINED_LINK } from './pageStyles';
import { FrequencyBar, RouteNameCell } from './pageParts';
import { AGENCY_PAGE_NOT_FOUND_TITLE, NO_FREQUENCY_PAGE_BODY, IRREGULAR_PERIOD_SHORT_LABEL, MAP_LINK, VIEW_ON_MAP, SEE_ALL_AGENCIES, WEEKDAY_HOURS_LABEL, ROUTES_FREQUENCY_HEADING, ROUTE_COLUMN, SERVICES_HEADING } from './content/noticeCopy';
import { periodShapeParts } from './utils/headwayText';

/** Read this page's numbers from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(slug: string | undefined): AgencyPageData | null {
  const data = readEmbeddedJson<AgencyPageData>(AGENCY_DATA_SCRIPT_ID);
  // CIV-1277: matched on the page's own path, since a parent's page and a moved member's page differ from the agency's slug.
  return data && slug && data.path === parentAgencyPagePath(slug) ? data : null;
}

/** "A, B and C" or "A, B, C and 4 other agencies" (namesList's wording), each name a link when it has a page. */
function LinkedNames({ items, others, counted }: { items: ReadonlyArray<{ name: string; href?: string; before?: string }>; others: number; counted: readonly [string, string] }) {
  return (
    <>
      {items.map((p, i) => (
        <span key={p.name}>
          {i > 0 ? (i === items.length - 1 && others === 0 ? ' and ' : ', ') : ''}
          {p.before}
          {p.href ? <AppLink className={UNDERLINED_LINK} to={p.href}>{p.name}</AppLink> : p.name}
        </span>
      ))}
      {others > 0 ? ` ${andOthers(others, ...counted)}` : ''}
    </>
  );
}

/**
 * The intro sentence, once, under the title. Each area it names links to that area's page; a city is plain text, since a
 * link always names the page it opens (#1283). Connecting agencies named in it are links when they have a page.
 * An agency with no regular midday service says so after it (CIV-965).
 */
function Intro({ data }: { data: AgencyPageData }) {
  const { intro, introLead, place, places, connections } = data;
  const sentence = 'mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]';
  const placeAt = introLead.length;
  const noMidday = data.agency.routes.length > 0 && data.agency.routes.every(r => r.midday == null)
    ? ` ${noMiddayIntroSentence(data.agency.routes.length)}`
    : '';
  if (!intro.startsWith(introLead) || !intro.startsWith(place, placeAt)) return <p className={sentence}>{intro}{noMidday}</p>;
  const at = intro.indexOf(CONNECTS_WITH, placeAt);
  const { named, others } = connectionNames(connections);
  const between = intro.slice(placeAt + place.length, at < 0 ? intro.length - 1 : at);
  // CIV-1277 (Ryan, 2026-11-02): a member's parent sits in the sentence, linked: "MTA NYCT Subway, part of MTA New York, operates …".
  const parentAt = data.parent ? introLead.indexOf(`${PART_OF}${data.parent.name},`) : -1;
  const lead = data.parent && parentAt >= 0
    ? <>{introLead.slice(0, parentAt)}{PART_OF}<AppLink className={UNDERLINED_LINK} to={data.parent.path}>{data.parent.name}</AppLink>{introLead.slice(parentAt + PART_OF.length + data.parent.name.length)}</>
    : introLead;
  return (
    <p className={sentence}>
      {lead}
      <LinkedNames items={places.named} others={places.others} counted={PLACE_OTHERS} />
      {between}
      {at >= 0 && named.length > 0 && (
        <>
          {CONNECTS_WITH}
          <LinkedNames items={named.map(c => ({ name: c.name, before: agencyArticle(c.name), href: c.page ? agencyPagePath(c.slug) : undefined }))} others={others} counted={['agency', 'agencies']} />
        </>
      )}
      .{noMidday}
    </p>
  );
}

/**
 * CIV-1605 (Ryan, pick 1): with the hours bar, a "from" equal to the bar's first time or an "until" equal to its last
 * leaves the cell, since the bar's end says it; a time that differs (one direction's later start) keeps its words.
 */
function edgeWithoutBarEnds(edge: { from?: number; until?: number; every: number }, runs: AgencyPageRoute['runs']): { from?: number; until?: number; every: number } {
  if (!runs) return edge;
  return {
    every: edge.every,
    ...(edge.from != null && edge.from !== runs.first ? { from: edge.from } : {}),
    ...(edge.until != null && edge.until !== runs.last ? { until: edge.until } : {}),
  };
}

/**
 * A period cell: the card's cadence (a range where alternating branches combine on a shared
 * stretch), "Limited" when the route runs but has no trustworthy cadence, "Irregular" where the
 * map list says so (#1249, CIV-1238), else a dash.
 */
/**
 * CIV-1787 (Ryan: "omg u have to scroll here that is not acceptable", "we changed it bc the bar was too slim"): with the
 * hours bar, the routes table never scrolls sideways. From lg up the frequency columns take their content's width, the
 * route names wrap in a column at least 10rem wide, and the hours bar takes the rest (at least 10rem, HoursBar); below lg the hours
 * column is hidden (DataTable `grow`).
 */
/**
 * CIV-1772 (Ryan, option 1): the frequency stays on one line and a gap, start or end note is a small grey second line,
 * the same in every cell, so rows read evenly.
 */
function PeriodCell({ text }: { text: string }) {
  const { main, note } = periodShapeParts(text);
  return <>{main}{note && <span className="block whitespace-nowrap text-xs text-[var(--text-muted)]">{note}</span>}</>;
}

function cell(col: 'am' | 'midday' | 'pm' | 'evening' | 'overnight', r: AgencyPageRoute, hoursBar = false): string {
  const v = r[col];
  // CIV-1300 (#1311): the route card's own reading, as the map's lists show it.
  const shown = r.text?.[col];
  if (shown) return shown;
  const edge = r.edge?.[col];
  if (v != null && edge) {
    const kept = hoursBar ? edgeWithoutBarEnds(edge, r.runs) : edge;
    return kept.from != null || kept.until != null ? periodEdgeText(kept) : routeListHeadwayText(edge.every);
  }
  if (v != null) return routeListHeadwayText(v, r.shared?.[col], true);
  if (Array.isArray(r.noRegular) && r.noRegular.includes(col)) return IRREGULAR_PERIOD_SHORT_LABEL;
  // CIV-1251: a period column with service but no number reads Irregular, whichever check found it.
  return Array.isArray(r.limited) && r.limited.includes(col) ? IRREGULAR_PERIOD_SHORT_LABEL : MISSING_VALUE;
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
      path: data?.path,
      pageTitle: data?.pageTitle,
    }));
  }, [agency, data?.intro, data?.description, data?.path, data?.pageTitle]);

  if (!agency && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

  if (!agency) {
    return (
      <EmptyPage title={AGENCY_PAGE_NOT_FOUND_TITLE} body={NO_FREQUENCY_PAGE_BODY} action={<ArrowLink href="/">{MAP_LINK}</ArrowLink>} />
    );
  }

  const stats = agencyStats(agency);
  // CIV-1605 (beta): one hour axis for every route's hours bar, from the agency's earliest to latest hour of service.
  const runHours = FEATURES.agencyHoursBar ? agency.routes.flatMap(r => r.runs?.hours ?? []) : [];
  const hoursAxis = runHours.length ? { first: Math.min(...runHours), last: Math.max(...runHours) } : null;
  const nearby = data!.nearby;

  return (
    <DocsPageLayout width="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PageTitle>{data!.title ?? agencyPageH1(agency)}</PageTitle>
              {data!.area ? (
                // CIV-1614: "Calgary, Alberta", "Greater Toronto and Hamilton Area, Ontario". An area with too few agencies for a page is named without a link (Ryan, 2026-11-01).
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {data!.area.page !== false ? <AppLink className={UNDERLINED_LINK} to={areaPagePath(data!.area.slug)}>{areaSubtitleName(data!.area)}</AppLink> : areaSubtitleName(data!.area)}
                  {agency.region && !areaSubtitleName(data!.area).includes(agency.region) && <>, {data!.regionPage ? <AppLink className={UNDERLINED_LINK} to={data!.regionPage}>{agency.region}</AppLink> : agency.region}</>}
                </p>
              ) : agency.city && <p className="mt-1 text-sm text-[var(--text-muted)]">{agency.city}</p>}
            </div>
            <ArrowLink className="shrink-0 whitespace-nowrap" href={data!.mapHref ?? agencyMapHref(agency)}>{VIEW_ON_MAP}</ArrowLink>
          </div>
          <Intro data={data!} />

          <section className="mt-14" aria-labelledby="routes-heading">
            <SectionTitle id="routes-heading">{ROUTES_FREQUENCY_HEADING}</SectionTitle>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={bandCounts(agency.routes)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this agency’s routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            {stats.byMode.map(group => (
              <div key={group.mode} className="mt-4">
                <SubsectionTitle className="pb-2" ariaHidden>{group.label} <span className="ml-1 font-normal text-[var(--text-muted)]">{group.routes.length}</span></SubsectionTitle>
                <ScrollX>
                  <DataTable
                    caption={`${group.label} ${group.routes.length}`}
                    layout="page"
                    rows={group.routes}
                    rowKey={r => `${r.name}-${r.longName ?? ''}`}
                    columns={[
                      { key: 'route', header: ROUTE_COLUMN, rowHeader: true, className: 'font-normal align-top', cell: r => {
                        const name = <RouteNameCell shortName={r.name} feedShortName={r.shortName} longName={r.longName} mode={r.mode} agencyName={agency.name} />;
                        // CIV-1787 (Ryan: "different spacing between rows"): with the hours bar, every row is two lines tall, room
                        // for a two-line name or a value with its note, so the bars sit evenly apart.
                        return hoursAxis ? <div className="min-h-[2lh] lg:min-w-[10rem]">{name}</div> : name;
                      } },
                      // CIV-1605 (local only): the weekday hours bar, under Ryan's "Weekday hours". Every cell is top-aligned (CIV-1787), so
                      // the main values share one line and a grey note hangs below.
                      ...(hoursAxis ? [{ key: 'hours', header: WEEKDAY_HOURS_LABEL, align: 'left' as const, grow: true, className: 'align-top', cell: (r: AgencyPageRoute) => r.runs ? <HoursBar runs={r.runs} axis={hoursAxis} /> : MISSING_VALUE }] : []),
                      { key: 'am', header: PERIOD_LABELS.amPeak, className: hoursAxis ? 'align-top whitespace-nowrap' : 'align-top', cell: r => <PeriodCell text={cell('am', r, !!hoursAxis)} /> },
                      { key: 'midday', header: PERIOD_LABELS.midday, className: hoursAxis ? 'align-top whitespace-nowrap' : 'align-top', cell: r => <PeriodCell text={cell('midday', r, !!hoursAxis)} /> },
                      { key: 'pm', header: PERIOD_LABELS.pmPeak, className: hoursAxis ? 'align-top whitespace-nowrap' : 'align-top', cell: r => <PeriodCell text={cell('pm', r, !!hoursAxis)} /> },
                      { key: 'evening', header: PERIOD_LABELS.evening, className: hoursAxis ? 'align-top whitespace-nowrap' : 'align-top', cell: r => <PeriodCell text={cell('evening', r, !!hoursAxis)} /> },
                      { key: 'overnight', header: PERIOD_LABELS.overnight, className: hoursAxis ? 'align-top whitespace-nowrap' : 'align-top', cell: r => <PeriodCell text={cell('overnight', r, !!hoursAxis)} /> },
                    ]}
                  />
                </ScrollX>
              </div>
            ))}
          </section>

          {'services' in data! && (
            // CIV-1277 (Ryan, 2026-11-02): a parent agency lists its members under "Services".
            <section className="mt-12" aria-labelledby="services-heading">
              <SectionTitle id="services-heading">{SERVICES_HEADING}</SectionTitle>
              <AgencyModeTable data={(data as ParentAgencyPageData).services} />
            </section>
          )}

          {nearby.length > 0 && (
            <section className="mt-12" aria-labelledby="nearby-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <SectionTitle id="nearby-heading">
                  {data!.area?.page !== false && data!.area ? <>{NEARBY_IN}<AppLink className="underline underline-offset-2" to={areaPagePath(data!.area.slug)}>{titleCase(`${NEARBY_IN}${areaRegionName(data!.area)}`).slice(NEARBY_IN.length)}</AppLink></> : 'Nearby Agencies'}
                </SectionTitle>
                <ArrowLink href={AGENCY_INDEX_PATH}>{SEE_ALL_AGENCIES}</ArrowLink>
              </div>
              <ul className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {nearby.map(o => (
                  <li key={o.slug}><AppLink className={UNDERLINED_LINK} to={agencyPagePath(o.slug)}>{o.name}</AppLink></li>
                ))}
              </ul>
            </section>
          )}

          {nearby.length === 0 && (
            <ArrowLink href={AGENCY_INDEX_PATH} className="mt-6">{SEE_ALL_AGENCIES}</ArrowLink>
          )}

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            {agencyDatesText(agency, data!.releaseDate)}
            {agency.websiteUrl && <> Agency website: <a className={LINK} href={agency.websiteUrl} rel="noopener noreferrer">{data!.title ?? agencyTitle(agency)}</a>.</>}
          </p>
    </DocsPageLayout>
  );
}
