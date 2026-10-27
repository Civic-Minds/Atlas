import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { agencyPagePath } from '../shared/agencyPages';
import { fitAgencyName } from './utils/agencyName';
import {
  AREA_DATA_SCRIPT_ID,
  AREA_TABLE_OTHER,
  areaDatesText,
  areaIntroJoiners,
  areaIntroName,
  areaIntroParts,
  areaMapHref,
  areaPageH1,
  areaSubtitle,
  areaTableColumnTitle,
  resolveAreaSeo,
  type AreaAgencyRow,
  type AreaPageData,
} from '../shared/areaPages';
import { ATLAS_MODE } from '../shared/config';
import { AGENCY_INDEX_PATH } from '../shared/agencyIndex';
import { applySeoToDocument, seoOrigin } from './lib/seoDom';
import { readEmbeddedJson } from './lib/embeddedData';
import { LINK, UNDERLINED_LINK } from './pageStyles';
import { FrequencyBar } from './pageParts';
import DocsPageLayout from './components/ui/DocsPageLayout';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import EmptyPage from './components/ui/EmptyPage';
import DataTable from './components/ui/DataTable';
import { AREA_PAGE_NOT_FOUND_TITLE, NO_FREQUENCY_PAGE_BODY } from './content/noticeCopy';

/**
 * Desktop widths of the agency table: the names' smallest width, and each mode column's. Seven mode columns fit beside the
 * names from 768px wide up, every header on at most two lines (CIV-973); narrower, the table scrolls.
 */
const AREA_NAME_COLUMN_REM = 10.75;
const AREA_MODE_COLUMN_REM = 5.5;
/**
 * This surface's own width, past the one rule (AGENCY_NAME_MAX_CHARS) because its layout allows two lines:
 * with the "Other" column the names column is at its narrowest, so a full name past this length would wrap to three lines
 * or more on a phone ("San Francisco Bay Area Water Emergency Transportation Authority (WETA)"); it shows the short display
 * name instead, with the full name on hover. Names this long or shorter fit on two lines at 390px and from 900px up (CIV-973).
 */
const NARROW_NAME_MAX_CHARS = 55;

/**
 * A mode header with a slash breaks after it ("Subway/" over "Metro"); the rest wrap at spaces.
 * A column that counts more than its own mode says what it counts on hover (CIV-973: "Bus and trolleybus routes").
 */
function modeHeader(label: string) {
  const slash = label.indexOf('/');
  const text = slash > 0 ? <>{label.slice(0, slash + 1)}<br />{label.slice(slash + 1)}</> : label;
  const title = areaTableColumnTitle(label);
  return title ? <span title={title}>{text}</span> : text;
}

/** The agency's link in the table: its full name, or in a narrow names column a short one with the full name on hover. */
function agencyNameLink(a: AreaAgencyRow, narrow: boolean) {
  const { text, title } = narrow ? fitAgencyName(a.name, a.displayName, NARROW_NAME_MAX_CHARS) : { text: a.name, title: undefined };
  return <a className={LINK} href={agencyPagePath(a.slug)} title={title}>{text}</a>;
}

/** Read this page's numbers from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(slug: string | undefined): AreaPageData | null {
  const data = readEmbeddedJson<AreaPageData>(AREA_DATA_SCRIPT_ID);
  return data && data.area.slug === slug ? data : null;
}

/** One metro area: its agencies side by side, with the numbers added up from the agency pages. */
export default function AreaPage({ data: dataProp }: { data?: AreaPageData }) {
  const params = useParams();
  const [data, setData] = useState<AreaPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
  // Not found is only shown once the lookup has finished; until then the page is blank, never a 404 flash.
  const [lookedUp, setLookedUp] = useState(() => !!data || !import.meta.env.DEV);
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./areaPageDevData').then(m => { setData(m.devAreaPageData(params.slug)); setLookedUp(true); });
  }, [data, params.slug]);

  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveAreaSeo(data, {
      mode: ATLAS_MODE,
      origin: seoOrigin(),
    }));
  }, [data]);

  if (!data && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

  if (!data) {
    return (
      <EmptyPage title={AREA_PAGE_NOT_FOUND_TITLE} body={NO_FREQUENCY_PAGE_BODY} action={<ArrowLink href="/">Open the Atlas map</ArrowLink>} />
    );
  }

  const subtitle = areaSubtitle(data);
  const intro = areaIntroParts(data);
  const joiners = areaIntroJoiners(intro);

  return (
    <DocsPageLayout width="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PageTitle>{areaPageH1(data)}</PageTitle>
              {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            <ArrowLink href={areaMapHref(data)}>View on map</ArrowLink>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
            {intro.lead}{joiners.opener}
            {intro.named.map((a, i) => <span key={a.slug}><a className={UNDERLINED_LINK} href={agencyPagePath(a.slug)}>{areaIntroName(data, a)}</a>{joiners.separators[i]}</span>)}
            {joiners.tail}
          </p>
          {data.area.note && <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{data.area.note}</p>}

          <section className="mt-14" aria-labelledby="agencies-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <SectionTitle id="agencies-heading">Agencies and weekday frequency</SectionTitle>
              <ArrowLink href={AGENCY_INDEX_PATH}>See all agencies</ArrowLink>
            </div>
            <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
            <FrequencyBar counts={data.bands} mapHref={areaMapHref(data)} />
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">The bar splits this area's routes by how often they run on a weekday midday. Each route is judged by its slower direction.</p>
            <div className="mt-6 -mx-2 overflow-x-auto">
                <DataTable
                  caption="Agencies and route counts by mode"
                  layout="page"
                  rowHref={a => agencyPagePath(a.slug)}
                  rows={data.agencies}
                  rowKey={a => a.slug}
                  columns={[
                    // Every area has the same mode columns (CIV-973); from md up they are narrow enough for eight to fit beside the names.
                    { key: 'agency', header: 'Agency', rowHeader: true, width: AREA_NAME_COLUMN_REM, className: 'font-normal', cell: a => agencyNameLink(a, data.modeColumns.includes(AREA_TABLE_OTHER)) },
                    ...data.modeColumns.map(m => ({ key: m, header: modeHeader(m), width: AREA_MODE_COLUMN_REM, cell: (a: (typeof data.agencies)[number]) => a.modes[m] ?? '–' })),
                  ]}
                />
            </div>
          </section>

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). {areaDatesText(data)}
          </p>
    </DocsPageLayout>
  );
}
