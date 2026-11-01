import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { agencyPagePath } from '../shared/agencyPages';
import { areaDatesText, areaIntroJoiners } from '../shared/areaPages';
import {
  REGION_DATA_SCRIPT_ID,
  regionBarNote,
  regionIntroParts,
  regionMapHref,
  regionPageH1,
  resolveRegionSeo,
  type RegionPageData,
} from '../shared/regionPages';
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
function readEmbeddedData(slug: string | undefined): RegionPageData | null {
  const data = readEmbeddedJson<RegionPageData>(REGION_DATA_SCRIPT_ID);
  return data && data.region.slug === slug ? data : null;
}

/** One state or province (CIV-976): its agencies side by side, laid out as an area page. */
export default function RegionPage({ data: dataProp }: { data?: RegionPageData }) {
  const params = useParams();
  const [data, setData] = useState<RegionPageData | null>(() => dataProp ?? readEmbeddedData(params.slug));
  // Not found is only shown once the lookup has finished; until then the page is blank, never a 404 flash.
  const [lookedUp, setLookedUp] = useState(() => !!data || !import.meta.env.DEV);
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./regionPageDevData').then(m => { setData(m.devRegionPageData(params.slug)); setLookedUp(true); });
  }, [data, params.slug]);

  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveRegionSeo(data, { mode: ATLAS_MODE, origin: seoOrigin() }));
  }, [data]);

  if (!data && !lookedUp) return <main className="min-h-screen bg-[var(--bg-app)]" aria-busy="true" />;

  if (!data) {
    return (
      <EmptyPage title={AREA_PAGE_NOT_FOUND_TITLE} body={NO_FREQUENCY_PAGE_BODY} action={<ArrowLink href="/">Open the Atlas map</ArrowLink>} />
    );
  }

  const intro = regionIntroParts(data);
  const joiners = areaIntroJoiners(intro);
  const mapHref = regionMapHref(data);

  return (
    <DocsPageLayout width="wide">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <PageTitle>{regionPageH1(data)}</PageTitle>
            </div>
            <ArrowLink href={mapHref}>View on map</ArrowLink>
          </div>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
            {intro.lead}{joiners.opener}
            {intro.named.map((a, i) => <span key={a.slug}><a className={UNDERLINED_LINK} href={agencyPagePath(a.slug)}>{a.title}</a>{joiners.separators[i]}</span>)}
            {joiners.tail}
          </p>

          <AgencyGroupSection data={data} mapHref={mapHref} barNote={regionBarNote(data)} />

          <p className="mt-12 text-sm leading-6 text-[var(--text-dim)]">{areaDatesText(data)}</p>
    </DocsPageLayout>
  );
}
