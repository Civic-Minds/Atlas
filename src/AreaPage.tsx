import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { agencyPagePath } from '../shared/agencyPages';
import {
  AREA_BAR_NOTE,
  AREA_DATA_SCRIPT_ID,
  areaDatesText,
  areaIntroJoiners,
  areaIntroName,
  areaIntroParts,
  areaMapHref,
  areaPageH1,
  areaSubtitle,
  resolveAreaSeo,
  type AreaPageData,
} from '../shared/areaPages';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument, seoOrigin } from './lib/seoDom';
import { readEmbeddedJson } from './lib/embeddedData';
import { UNDERLINED_LINK } from './pageStyles';
import AgencyGroupSection from './AgencyGroupSection';
import DocsPageLayout from './components/ui/DocsPageLayout';
import ArrowLink from './components/ui/ArrowLink';
import { PageTitle } from './components/ui/PageTitle';
import EmptyPage from './components/ui/EmptyPage';
import { AREA_PAGE_NOT_FOUND_TITLE, NO_FREQUENCY_PAGE_BODY } from './content/noticeCopy';

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

          <AgencyGroupSection data={data} mapHref={areaMapHref(data)} barNote={AREA_BAR_NOTE} />

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">
            Area: {data.area.officialName} ({data.area.type === 'CMA' ? 'Statistics Canada census metropolitan area' : 'US Census metropolitan statistical area'}). {areaDatesText(data)}
          </p>
    </DocsPageLayout>
  );
}
