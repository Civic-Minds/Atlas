import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router';
import { Activity, Bus } from 'lucide-react';
import type { Agency } from '../../App';
import ModeTab from '../../components/ModeTab';
import { AGENCY_COLUMN } from '../../content/noticeCopy';
import { agencyNames } from '../../utils/agencyName';
import { getSavedStudioAgency, saveStudioAgency } from '../../utils/studioAgency';
import { useSidebarFrame } from '../../context/SidebarFrame';
import { PAGE_NAMES, tabTitle } from '../../../shared/pageNames';
import { STUDIO_MANIFEST_DEV_URL, STUDIO_PAGES, studioAgencyFrom, studioAgencyListFrom, studioPageFor, type StudioPageKey } from '../../../shared/studioAgencies';
import { LIVE_STUDIO_AGENCIES_URL } from '../../../shared/liveStudioAgencies';
import { STUDIO_PAGE_NAMES } from '../../../shared/studioWording';
import Fleet from './Fleet';
import Live from './Live';
import StudioNoData from './StudioNoData';
import { type StudioMenu } from './StudioChips';
import { AgencyDataSourceLink } from '../../components/Interval/cardUi';
import { useDevFile } from './useDevFile';
import { MODE_EASE, useModeLeaving } from '../../components/ModeTransition';
import { FEATURES } from '../../../shared/config';
import { StudioMapFrameProvider, studioFrameKey } from './StudioMapFrame';

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
  /** App's top-bar slot for the view's chips (headerPortalRef). */
  headerPortal: Element | null;
  /** App's view-tab row slot, where Studio's pages show as tabs. */
  tabsPortal: Element | null;
  /** False while App is leaving Studio: the open page fades out, as the main map's modes do (CIV-1921). */
  active?: boolean;
}

export default function Studio({ agencyCatalog, headerPortal, tabsPortal, active = true }: StudioProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const set = (changes: Record<string, string | null>) => setSearchParams(p => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) { if (v == null) n.delete(k); else n.set(k, v); }
    return n;
  });
  const liveList = useDevFile<{ agencies: string[] }>(LIVE_STUDIO_AGENCIES_URL);
  const fleetList = useDevFile<{ agencies: string[] }>(STUDIO_MANIFEST_DEV_URL);
  // One reading and one default for both pages (CIV-1898): the same list rule, the same default agency.
  const listOf = studioAgencyListFrom;
  // The address's page, or the first page that has the address's agency (studioPageFor); null until the lists load.
  // CIV-1883 (Ryan: "The city should be persistent"): the address's agency, else the one Studio was last on in this browser.
  const wantedAgency = searchParams.get('agency') ?? getSavedStudioAgency();
  const page = studioPageFor(searchParams.get('page'), wantedAgency, { live: listOf(liveList), fleet: listOf(fleetList) });
  const pageAgencies = page ? listOf(page === 'live' ? liveList : fleetList) : null;
  // CIV-1883: a page without data for the chosen agency keeps the agency and says so (no silent swap to another one).
  const noData = !!(page && wantedAgency && pageAgencies && pageAgencies.length > 0 && !pageAgencies.includes(wantedAgency) && searchParams.get('page'));
  const slug = noData ? wantedAgency! : studioAgencyFrom(wantedAgency, pageAgencies);
  const route = searchParams.get('route');
  const setRoute = (r: string | null) => set({ route: r });
  const nameOf = (s: string) => { const a = agencyCatalog.find(x => x.slug === s); return a ? agencyNames(a).name : s; };
  const agency = nameOf(slug);
  const agencyOptions = useMemo(() => (pageAgencies ?? [slug]).filter(Boolean).map(s => [s, nameOf(s)] as const), [agencyCatalog, pageAgencies, slug]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new page or agency starts with no route open.
  const selected = useMemo(() => agencyCatalog.find(a => a.slug === slug) ?? null, [agencyCatalog, slug]);
  // The selected agency's own source sits beside the agency chip, the agency card's Source link (CIV-1890).
  const agencyMenu: StudioMenu | null = page && slug ? { key: 'agency', label: AGENCY_COLUMN, value: slug, options: agencyOptions, onPick: s => set({ agency: s, route: null }), after: selected ? <AgencyDataSourceLink agency={{ slug: selected.slug, websiteUrl: selected.websiteUrl ?? undefined }} /> : null } : null;
  // The active page's tab toggles its panel off, like the main map's mode tabs (#1588): Studio stays open on its own map with the
  // agency still chosen and no panel (?panel=closed); any tab opens its page again.
  const [measureSlot, setMeasureSlot] = useState<HTMLElement | null>(null);
  // Opening Studio with no page in the address is the same state: its map, the remembered agency, no panel (Ryan: Live and Fleet open only when clicked).
  const closed = searchParams.get('panel') === 'closed' || !searchParams.get('page');
  // The map's framing is the frame's (CIV-1925, CIV-1921): one key per agency and route, and the key last framed, kept across pages.
  const framedMemory = useRef<string | null>(null);
  // Closing the panel or leaving Studio fades the page out the way it came in (useModeLeaving, as the main map's modes leave,
  // CIV-1921): for that ease the page keeps showing what it showed, with no chips, while the address has already moved on.
  const open = active && !closed;
  const leaving = useModeLeaving(open, FEATURES.modeTransitions);
  const now = { page, slug, route, noData, agency };
  const held = useRef(now);
  if (open) held.current = now;
  const v = open ? now : held.current;
  const mapFrame = useMemo(() => ({ frameKey: studioFrameKey(v.slug, v.route), framedMemory }), [v.slug, v.route]);
  const pickPage = (k: StudioPageKey) => {
    if (k === page && !closed) { set({ panel: 'closed', agency: slug, route: null }); return; }
    // A page switch carries the open route across (Ryan, CIV-1925: Live on the 504 opens Fleet on the 504) and keeps the map
    // where it is, as the main map's mode tabs do: the new page's view counts as framed when the map already shows this
    // agency. A new agency (or a first open) still frames.
    const keep = closed ? null : route;
    if (framedMemory.current?.startsWith(`${slug}:`)) framedMemory.current = studioFrameKey(slug, keep);
    set({ page: k, panel: null, agency: slug, route: keep });
  };
  // Remember the agency when it is the one asked for, never a fallback another page's list swapped in.
  useEffect(() => { if (active && page && slug && slug === wantedAgency && pageAgencies?.includes(slug)) saveStudioAgency(slug); }, [active, page, slug, wantedAgency, pageAgencies]);
  useEffect(() => { if (active) document.title = tabTitle(PAGE_NAMES.studio, agency); }, [active, agency]);
  const frameStyle = useSidebarFrame().style;
  const chips = open ? headerPortal : null;

  return (
    <StudioMapFrameProvider value={mapFrame}>
      {active && tabsPortal && page && createPortal(
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
      {(open || leaving) && (
        <div className={open ? '' : `opacity-0 transition-opacity ${MODE_EASE} pointer-events-none`}>
          {v.noData && (
            <StudioNoData agencyName={v.agency} options={agencyOptions} onPick={s => set({ agency: s, route: null })} agencyMenu={agencyMenu} headerPortal={chips} frameStyle={frameStyle} />
          )}
          {!v.noData && v.page === 'fleet' && v.slug && (
            <Fleet key={v.slug} slug={v.slug} agency={v.agency} route={v.route} setRoute={setRoute} agencyMenu={agencyMenu} headerPortal={chips} frameStyle={frameStyle} />
          )}
          {!v.noData && v.page === 'live' && v.slug && (
            <Live key={v.slug} slug={v.slug} measureSlot={open ? measureSlot : null} route={v.route} setRoute={setRoute} agencyMenu={agencyMenu} headerPortal={chips} frameStyle={frameStyle} />
          )}
        </div>
      )}
    </StudioMapFrameProvider>
  );
}
