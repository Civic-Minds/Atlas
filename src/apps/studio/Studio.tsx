import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import { Activity, Bus } from 'lucide-react';
import type { Agency } from '../../App';
import ModeTab from '../../components/ModeTab';
import { AGENCY_COLUMN } from '../../content/noticeCopy';
import { agencyNames } from '../../utils/agencyName';
import { getSavedStudioAgency, saveStudioAgency } from '../../utils/studioAgency';
import { sidebarFrameStyle } from '../../styles';
import { PAGE_NAMES, tabTitle } from '../../../shared/pageNames';
import { STUDIO_DEFAULT_AGENCY, STUDIO_MANIFEST_DEV_URL, STUDIO_PAGES, studioAgencyFrom, studioPageFor, type StudioPageKey } from '../../../shared/studioAgencies';
import { LIVE_STUDIO_AGENCIES_URL } from '../../../shared/liveStudioAgencies';
import { STUDIO_PAGE_NAMES } from '../../../shared/studioWording';
import Fleet from './Fleet';
import Live from './Live';
import { type StudioMenu } from './StudioChips';
import { useDevFile } from './useDevFile';

/**
 * Atlas Studio (CIV-1828), a view of the main map as History is: App's top bar, its view tabs (Studio's pages in place of
 * the map's), the main map's chips, sidebar card, map, key and footer. The view owns the page (?page=), the agency
 * (?agency=) and the route (?route=); a page owns the rest. Each page lists only the agencies it has data for: Live's from
 * the recordings (LIVE_STUDIO_AGENCIES_URL), Fleet's from the built Studio files (STUDIO_MANIFEST_DEV_URL).
 * Local only (FEATURES.studio).
 */

const PAGE_ICONS: Record<StudioPageKey, typeof Bus> = { live: Activity, fleet: Bus };

export interface StudioProps {
  agencyCatalog: Agency[];
  sidebarLeft: number;
  searchBarWidth?: number;
  /** App's top-bar slot for the view's chips (headerPortalRef). */
  headerPortal: Element | null;
  /** App's view-tab row slot, where Studio's pages show as tabs. */
  tabsPortal: Element | null;
}

export default function Studio({ agencyCatalog, sidebarLeft, searchBarWidth, headerPortal, tabsPortal }: StudioProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const set = (changes: Record<string, string | null>) => setSearchParams(p => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) { if (v == null) n.delete(k); else n.set(k, v); }
    return n;
  });
  const liveList = useDevFile<{ agencies: string[] }>(LIVE_STUDIO_AGENCIES_URL);
  const fleetList = useDevFile<{ agencies: string[] }>(STUDIO_MANIFEST_DEV_URL);
  const listOf = (f: typeof liveList) => (f && f !== 'missing' ? f.agencies : f === 'missing' ? [] : null);
  // The address's page, or the first page that has the address's agency (studioPageFor); null until the lists load.
  // CIV-1883 (Ryan: "The city should be persistent"): the address's agency, else the one Studio was last on in this browser.
  const wantedAgency = searchParams.get('agency') ?? getSavedStudioAgency();
  const page = studioPageFor(searchParams.get('page'), wantedAgency, { live: listOf(liveList), fleet: listOf(fleetList) });
  const pageAgencies = page ? listOf(page === 'live' ? liveList : fleetList) : null;
  // Live opens on its first agency (TTC), Fleet on Kingston.
  const slug = studioAgencyFrom(wantedAgency, pageAgencies, page === 'live' ? pageAgencies?.[0] ?? '' : STUDIO_DEFAULT_AGENCY);
  const route = searchParams.get('route');
  const setRoute = (r: string | null) => set({ route: r });
  const nameOf = (s: string) => { const a = agencyCatalog.find(x => x.slug === s); return a ? agencyNames(a).name : s; };
  const agency = nameOf(slug);
  const agencyOptions = useMemo(() => (pageAgencies ?? [slug]).filter(Boolean).map(s => [s, nameOf(s)] as const), [agencyCatalog, pageAgencies, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new page or agency starts with no route open.
  const agencyMenu: StudioMenu | null = page && slug ? { key: 'agency', label: AGENCY_COLUMN, value: slug, options: agencyOptions, onPick: s => set({ agency: s, route: null }) } : null;
  // The active page's tab toggles its panel off, like the main map's mode tabs (#1588): Studio stays open on its own map with the
  // agency still chosen and no panel (?panel=closed); any tab opens its page again.
  const [measureSlot, setMeasureSlot] = useState<HTMLElement | null>(null);
  // Opening Studio with no page in the address is the same state: its map, the remembered agency, no panel (Ryan: Live and Fleet open only when clicked).
  const closed = searchParams.get('panel') === 'closed' || !searchParams.get('page');
  const pickPage = (k: StudioPageKey) => (k === page && !closed ? set({ panel: 'closed', agency: slug, route: null }) : set({ page: k, panel: null, agency: (listOf(k === 'live' ? liveList : fleetList) ?? []).includes(slug) ? slug : null, route: null }));
  // Remember the agency when it is the one asked for, never a fallback another page's list swapped in.
  useEffect(() => { if (page && slug && slug === wantedAgency && pageAgencies?.includes(slug)) saveStudioAgency(slug); }, [page, slug, wantedAgency, pageAgencies]);
  useEffect(() => { document.title = tabTitle(PAGE_NAMES.studio, agency); }, [agency]);
  const frameStyle = sidebarFrameStyle(sidebarLeft, searchBarWidth);

  return (
    <>
      {tabsPortal && page && createPortal(
        STUDIO_PAGES.map(k => {
          const Icon = PAGE_ICONS[k];
          return (
            <Fragment key={k}>
              <ModeTab icon={<Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />} label={STUDIO_PAGE_NAMES[k]} active={!closed && page === k} onClick={() => pickPage(k)} />
              {/* CIV-1886 (Ryan: "should measure be beside the live button when u open it"): Live's Measure picker sits right after its tab. */}
              {k === 'live' && !closed && page === 'live' && <span ref={setMeasureSlot} className="contents" />}
            </Fragment>
          );
        }),
        tabsPortal,
      )}
      {!closed && page === 'fleet' && slug && (
        <Fleet key={slug} slug={slug} agency={agency} route={route} setRoute={setRoute} agencyMenu={agencyMenu} headerPortal={headerPortal} frameStyle={frameStyle} />
      )}
      {!closed && page === 'live' && slug && (
        <Live key={slug} slug={slug} measureSlot={measureSlot} route={route} setRoute={setRoute} agencyMenu={agencyMenu} headerPortal={headerPortal} frameStyle={frameStyle} />
      )}
    </>
  );
}
