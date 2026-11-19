import { useEffect, useState } from 'react';
import AppLink from './components/ui/AppLink';
import {
  AGENCY_INDEX_DATA_SCRIPT_ID,
  agencyIndexDescription,
  agencyIndexRegionId,
  resolveAgencyIndexSeo,
  type AgencyIndexData,
} from '../shared/agencyIndex';
import { agencyPagePath, parentAgencyPagePath, regionPagePath } from '../shared/pagePaths';
import { fitAgencyName } from './utils/agencyName';
import { areaPagePath } from '../shared/areas';
import { ATLAS_MODE, FEATURES } from '../shared/config';
import { plural } from '../shared/overflowText';
import historyAgencies from '../shared/data/history-agencies.json';
import type { HistoryAgencyList } from '../shared/historyEligibility';
import { isLiveEligibleSlug } from '../shared/livePollingConfig';
import { applySeoToDocument, seoOrigin } from './lib/seoDom';
import { readEmbeddedJson } from './lib/embeddedData';
import { LINK, UNDERLINED_LINK } from './pageStyles';
import Tag from './components/ui/Tag';
import { PageTitle, SectionTitle } from './components/ui/PageTitle';
import PageShell from './components/ui/PageShell';
import DocsPageLayout from './components/ui/DocsPageLayout';
import { countText } from '../shared/numberText';
import { PAGE_NAMES } from '../shared/pageNames';
import { AREAS_HEADING, HISTORY_TAG, LIVE_TAG } from './content/noticeCopy';
import { SCROLL_BELOW_HEADER } from './styles';

/** Shared multi-column layout for the Areas list and every country's agency list. */
const INDEX_COLUMNS = 'sm:columns-2 lg:columns-3 sm:gap-x-8';

/** Beta only: agencies with 10+ years of schedule history, from the small list build-history writes. */
const HISTORY_SLUGS: ReadonlySet<string> = new Set((historyAgencies as HistoryAgencyList).slugs);

/** Beta-only "Live" / "History" tags after an agency's route count, tight around the word (CIV-967). */
function AgencyTags({ live, history }: { live: boolean; history: boolean }) {
  return (
    <>
      {live && <Tag size="inline" className="ml-1.5">{LIVE_TAG}</Tag>}
      {history && <Tag size="inline" className={live ? 'ml-1' : 'ml-1.5'}>{HISTORY_TAG}</Tag>}
    </>
  );
}

/**
 * Every region and agency page in one list. The prerender writes the whole list as plain links, so it works
 * without scripts. The dev server (no prerendered HTML) loads from the summary file instead (dead code in production builds).
 */
export default function AgenciesIndexPage({ data: dataProp }: { data?: AgencyIndexData }) {
  const [data, setData] = useState<AgencyIndexData | null>(() => dataProp ?? readEmbeddedJson<AgencyIndexData>(AGENCY_INDEX_DATA_SCRIPT_ID));
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./agenciesIndexDevData').then(m => setData(m.devAgencyIndexData()));
  }, [data]);
  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveAgencyIndexSeo(data, {
      mode: ATLAS_MODE,
      origin: seoOrigin(),
    }));
  }, [data]);
  // A link to a state or province heading (CIV-966) lands on it even when the list renders after the page loads.
  useEffect(() => {
    if (!data || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [data]);

  if (!data) {
    return (
      <PageShell variant="wide">{null}</PageShell>
    );
  }

  const areas = data.areas;
  const groups = data.groups;

  return (
    <DocsPageLayout width="wide">
          <PageTitle>{PAGE_NAMES.agencyIndex}</PageTitle>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{agencyIndexDescription(data)}</p>

          {areas.length > 0 && (
            <section className="mt-12" aria-labelledby="index-regions">
              <SectionTitle id="index-regions">{AREAS_HEADING}</SectionTitle>
              <ul className={`mt-3 text-sm ${INDEX_COLUMNS}`}>
                {areas.map(a => <li key={a.slug} className="break-inside-avoid py-1"><AppLink className={UNDERLINED_LINK} to={areaPagePath(a.slug)}>{a.shortName}</AppLink></li>)}
              </ul>
            </section>
          )}

          {groups.map(g => (
            <section key={g.country} className="mt-12" aria-labelledby={`index-${g.country}`}>
              <SectionTitle id={`index-${g.country}`}>{g.country}</SectionTitle>
              {g.regions.map(r => (
                <div key={r.region} className="mt-5">
                  {r.region !== g.country && <h3 id={agencyIndexRegionId(g.country, r.region)} className={`${SCROLL_BELOW_HEADER} text-base font-black`}>{r.href ? <AppLink className={UNDERLINED_LINK} to={regionPagePath(r.region)}>{r.region}</AppLink> : r.region}</h3>}
                  <ul className={`mt-2 text-sm ${INDEX_COLUMNS}`}>
                    {r.agencies.map(a => {
                      const routes = <span className="text-[var(--text-muted)]">{'\u00A0'}·{'\u00A0'}{countText(a.routes)}{'\u00A0'}{plural(a.routes, 'route')}</span>;
                      // A parent agency's row (CIV-1277) links its own page and carries no member's tags. Links are built from
                      // slugs, never read from the embedded JSON's text (CodeQL js/xss-through-dom).
                      const href = a.parent ? parentAgencyPagePath(a.slug) : agencyPagePath(a.slug);
                      const live = !a.parent && FEATURES.live && isLiveEligibleSlug(a.slug);
                      const history = !a.parent && FEATURES.history && HISTORY_SLUGS.has(a.slug);
                      if (live || history) {
                        // Tagged rows stay on one line: a name too long for the column shows its short name ("CDTA"), with
                        // the full name on hover (CIV-967); one still too long shortens with "…".
                        const { text, title } = fitAgencyName(a.name, a.shortName);
                        return (
                          <li key={a.slug} className="flex min-w-0 items-baseline break-inside-avoid py-[3px]">
                            <AppLink className={`${LINK} min-w-0 truncate underline underline-offset-2`} to={href} title={title ?? a.name}>{text}</AppLink>
                            <span className="shrink-0 whitespace-nowrap">{routes}<AgencyTags live={live} history={history} /></span>
                          </li>
                        );
                      }
                      return (
                        <li key={a.slug} className="break-inside-avoid py-[3px]">
                          <AppLink className={UNDERLINED_LINK} to={href}>{a.name}</AppLink>
                          {routes}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
    </DocsPageLayout>
  );
}
