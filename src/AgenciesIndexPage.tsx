import { useEffect, useState } from 'react';
import {
  AGENCY_INDEX_DATA_SCRIPT_ID,
  agencyIndexDescription,
  matchesFilter,
  resolveAgencyIndexSeo,
  type AgencyIndexData,
} from '../shared/agencyIndex';
import { agencyPagePath } from '../shared/agencyPages';
import { areaPagePath } from '../shared/areas';
import { ATLAS_MODE } from '../shared/config';
import { applySeoToDocument } from './lib/seoDom';
import { LINK } from './pageStyles';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';

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
 * Every area and agency page in one list. The prerender writes the whole list as plain links, so it works
 * without scripts; in the browser the filter box narrows it as you type. The dev server (no prerendered
 * HTML) loads from the summary file instead (dead code in production builds).
 */
export default function AgenciesIndexPage({ data: dataProp }: { data?: AgencyIndexData }) {
  const [data, setData] = useState<AgencyIndexData | null>(() => dataProp ?? readEmbeddedData());
  const [query, setQuery] = useState('');
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
      <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
        <div className="mx-auto max-w-4xl"><SiteHeader /></div>
      </main>
    );
  }

  const areas = data.areas.filter(a => matchesFilter(a.title, query));
  const groups = data.groups
    .map(g => ({
      country: g.country,
      regions: g.regions
        .map(r => ({ region: r.region, agencies: r.agencies.filter(a => matchesFilter(`${a.name} ${r.region} ${g.country}`, query)) }))
        .filter(r => r.agencies.length > 0),
    }))
    .filter(g => g.regions.length > 0);
  const nothing = areas.length === 0 && groups.length === 0;

  return (
    <main className="min-h-screen bg-[var(--bg-app)] px-6 py-8 text-[var(--text-primary)] sm:px-10 lg:px-16">
      <div className="mx-auto max-w-4xl">
        <SiteHeader />

        <article className="pb-16 pt-10 sm:pt-14">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">All agencies and areas</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">{agencyIndexDescription(data)}</p>

          <form role="search" className="mt-8" onSubmit={e => e.preventDefault()}>
            <label htmlFor="index-filter" className="text-sm font-bold">Filter by name</label>
            <input
              id="index-filter"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
              placeholder="Agency, area, state or province"
              className="mt-2 block w-full max-w-md rounded-lg border border-[var(--border-primary)] bg-[var(--bg-app)] px-3 py-2 text-base text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] focus:outline-none"
            />
          </form>

          {nothing && <p className="mt-8 text-sm text-[var(--text-muted)]" role="status">Nothing matches “{query}”.</p>}

          {areas.length > 0 && (
            <section className="mt-12" aria-labelledby="index-areas">
              <h2 id="index-areas" className="text-xl font-black tracking-tight">Areas</h2>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {areas.map(a => <li key={a.slug}><a className={`${LINK} underline underline-offset-2`} href={areaPagePath(a.slug)}>{a.title}</a></li>)}
              </ul>
            </section>
          )}

          {groups.map(g => (
            <section key={g.country} className="mt-12" aria-labelledby={`index-${g.country}`}>
              <h2 id={`index-${g.country}`} className="text-xl font-black tracking-tight">{g.country}</h2>
              {g.regions.map(r => (
                <div key={r.region} className="mt-5">
                  <h3 className="text-base font-black">{r.region}</h3>
                  <ul className="mt-2 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                    {r.agencies.map(a => (
                      <li key={a.slug}>
                        <a className={`${LINK} underline underline-offset-2`} href={agencyPagePath(a.slug)}>{a.name}</a>
                        <span className="text-[var(--text-muted)]"> · {a.routes.toLocaleString('en-US')} {a.routes === 1 ? 'route' : 'routes'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </article>

        <SiteFooter />
      </div>
    </main>
  );
}
