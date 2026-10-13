import { useEffect, useState } from 'react';
import {
  AGENCY_INDEX_DATA_SCRIPT_ID,
  agencyIndexDescription,
  resolveAgencyIndexSeo,
  type AgencyIndexData,
} from '../shared/agencyIndex';
import { agencyPagePath } from '../shared/agencyPages';
import { areaPagePath } from '../shared/areas';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { LINK } from './pageStyles';
import SiteFooter from './components/SiteFooter';
import PageShell from './components/ui/PageShell';

/** Read this page's data from the JSON the prerender embedded next to the app root. */
function readEmbeddedData(): AgencyIndexData | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = document.getElementById(AGENCY_INDEX_DATA_SCRIPT_ID)?.textContent;
    return raw ? (JSON.parse(raw) as AgencyIndexData) : null;
  } catch {
    return null;
  }
}

/**
 * Every region and agency page in one list. The prerender writes the whole list as plain links, so it works
 * without scripts. The dev server (no prerendered
 * HTML) loads from the summary file instead (dead code in production builds).
 */
export default function AgenciesIndexPage({ data: dataProp }: { data?: AgencyIndexData }) {
  const [data, setData] = useState<AgencyIndexData | null>(() => dataProp ?? readEmbeddedData());
  useEffect(() => {
    if (data || !import.meta.env.DEV) return;
    void import('./agenciesIndexDevData').then(m => setData(m.devAgencyIndexData()));
  }, [data]);
  useEffect(() => {
    if (!data) return;
    applySeoToDocument(document, resolveAgencyIndexSeo(data, {
      mode: ATLAS_MODE,
      origin: ATLAS_MODE === 'public' ? undefined : window.location.origin,
    }));
  }, [data]);

  if (!data) {
    return (
      <PageShell variant="wide">{null}</PageShell>
    );
  }

  const areas = data.areas;
  const groups = data.groups;

  return (
    <PageShell variant="wide">

        <article className="pb-16 pt-10 sm:pt-14">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">All agencies and regions</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{agencyIndexDescription(data)}</p>

          {areas.length > 0 && (
            <section className="mt-12" aria-labelledby="index-regions">
              <h2 id="index-regions" className="text-xl font-black tracking-tight">Regions</h2>
              <ul className="mt-3 text-sm sm:columns-2 lg:columns-3 sm:gap-x-8">
                {areas.map(a => <li key={a.slug} className="break-inside-avoid py-1"><a className={`${LINK} underline underline-offset-2`} href={areaPagePath(a.slug)}>{a.shortName}</a></li>)}
              </ul>
            </section>
          )}

          {groups.map(g => (
            <section key={g.country} className="mt-12" aria-labelledby={`index-${g.country}`}>
              <h2 id={`index-${g.country}`} className="text-xl font-black tracking-tight">{g.country}</h2>
              {g.regions.map(r => (
                <div key={r.region} className="mt-5">
                  <h3 className="text-base font-black">{r.region}</h3>
                  <ul className="mt-2 text-sm sm:columns-2 sm:gap-x-8">
                    {r.agencies.map(a => (
                      <li key={a.slug} className="break-inside-avoid py-[3px]">
                        <a className={`${LINK} underline underline-offset-2`} href={agencyPagePath(a.slug)}>{a.name}</a>
                        <span className="text-[var(--text-muted)]">{'\u00A0'}·{'\u00A0'}{a.routes.toLocaleString('en-US')}{'\u00A0'}{a.routes === 1 ? 'route' : 'routes'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </article>

        <SiteFooter />
    </PageShell>
  );
}
