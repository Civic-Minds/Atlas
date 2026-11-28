import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MEASURE_LABEL, TIME_LABEL } from '../../content/noticeCopy';
import ViewLoadingPanel from '../../components/ViewLoadingPanel';
import { RouteTitleName } from '../../components/RouteRowName';
import { PanelBody } from '../../components/ui/Panel';
import { StudioRouteSearch, useStudioSearchOpen } from './StudioSearch';
import StudioPanel from '../../components/ui/WidePanel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import { MapNote } from '../../components/ui/MapNote';
import { STUDIO_MAP_MEASURES, type MapMeasure } from '../../components/Live/routeMapModel';
import { PERIOD_BANDS_ONLY } from '../../components/Live/sections/figures';
import { periodMenuOptions } from '../../components/Interval/pickers';
import { liveBandNow } from '../../components/Live/liveBandNow';
import WidgetPanel from '../../components/Live/tool/WidgetPanel';
import { useLiveBody } from '../../components/Live/tool/useLiveBody';
import { SidebarCardHeader, SidebarCardHeaderBlock, SidebarCardShell } from '../../components/Interval/cardUi';
import { usePageMapOverlay, type MapPick } from '../../context/PageMapOverlay';
import { useStudioMapFrame } from '../../context/StudioMapFrame';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveAgencyName } from '../../hooks/useLiveAgencyName';
import type { LiveAgencyState } from '../../LiveAgencyPage';
import { DataUpTo } from '../../LiveRoutePage';
import { routeLabels } from '../../utils/format';
import type { DashboardBand } from '../../../shared/liveDashboard';
import { DIRECTION_LABEL } from '../../../shared/liveWording';
import { GAP_MEASURES } from '../../../shared/liveDashboard';
import LiveGlance from './LiveGlance';
import RouteRightNow from './RouteRightNow';
import { PanelSectionsProvider } from '../../components/Live/panelSections';
import type { PanelWidget } from '../../components/Live/tool/WidgetPanel';
import StudioChips, { type StudioMenu } from './StudioChips';
import { ChipMenu, ChipOptions, useChipRow } from '../../components/Interval/ChipMenu';
import { CutoffFigures, cutoffsSection, type SetCutoffs } from './StudioCutoffs';
import { liveRouteNumber } from '../../../shared/liveAgency';

/**
 * Live, the first page of Atlas Studio on the main map (CIV-1828 step 2): where vehicles lose time, stop to stop, from the
 * recordings. The Live tool's own logic (useLiveBody, one source for both) on the main map's frame: Studio's chips in the
 * top bar, the sidebar as the main map's card (Panel sidebar), the map drawn through the page overlay, the key in the
 * map's key slot and its note in the notice slot. The shell owns the agency and the route; this owns the measure, the
 * time of day, the direction and the picked stop or stretch.
 */

export interface LiveProps {
  slug: string;
  route: string | null;
  setRoute: (r: string | null) => void;
  /** The agency's Live answer (useLiveAgency), read by the shell so the Live tab's count shows on every page (#1764). */
  state: LiveAgencyState;
  /** The agency menu, the shell's, first in the top bar. */
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  /** The sidebar card's place, from the Studio frame (useSidebarFrame), as History's panels. */
  frameStyle: CSSProperties;
}

export default function Live({ slug, route, setRoute, state, agencyMenu, headerPortal, frameStyle }: LiveProps) {
  const agencyName = useLiveAgencyName(slug);
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => liveBandNow(agencies.find(a => a.slug === slug)?.timezone));
  if (state.kind !== 'done' || state.data.status !== 'ready') {
    return (
      <>
        <StudioChips container={headerPortal} menus={[agencyMenu]} />
        {/* One loading panel and one way of saying why there's nothing (CIV-1925 phase 4). */}
        {state.kind === 'loading' ? <ViewLoadingPanel what={agencyName} />
          : <StudioPanel style={frameStyle}><PanelEmpty kind={state.kind === 'error' ? 'error' : 'empty'}>{state.kind === 'error' ? state.reason : state.data.status !== 'ready' ? state.data.reason : null}</PanelEmpty></StudioPanel>}
      </>
    );
  }
  return <Ready slug={slug} agencyName={agencyName} s={state.data.summary} route={route} setRoute={setRoute} band={band} setBand={setBand} agencyMenu={agencyMenu} headerPortal={headerPortal} frameStyle={frameStyle} />;
}

function Ready({ slug, agencyName, s, route, setRoute, band, setBand, agencyMenu, headerPortal, frameStyle }: Omit<LiveProps, 'route' | 'state'> & {
  agencyName: string; s: Parameters<typeof useLiveBody>[0]['s']; route: string | null; band: DashboardBand; setBand: (b: DashboardBand) => void;
}) {
  const [measure, setMeasure] = useState<MapMeasure | null>(null);
  const [dir, setDir] = useState<number | null>(null);
  const [pick, setPick] = useState<MapPick | null>(null);
  // A planner's own cut-offs (CIV-1886), kept across routes while Studio is open.
  const [cutoffs, setCutoffs] = useState<SetCutoffs>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pickRoute = (r: string | null) => { setRoute(r); if (!r) setDir(null); setPick(null); };
  const m = useLiveBody({ agency: slug, agencyName, s, route, setRoute: pickRoute, dir, setDir, band, measure, pick, setPick, inStudio: true });

  // The page overlay: the map draws Live's segments, the pick's card follows its anchor. The overlay's pick callback is kept
  // in a ref: a new one each render would redraw the map every time.
  const onMapPick = useRef(m.onMapPick);
  onMapPick.current = m.onMapPick;
  const { setOverlay } = usePageMapOverlay();
  // "Data up to" sits in the map's loading-pill spot (the counts row), shown once loading finishes.
  const shownMeasure = m.held && measure && !GAP_MEASURES.has(measure) ? null : measure;
  // CIV-2000: a held route has only the measures read from gaps between vehicles.
  const measureOptions = useMemo(() => (m.held ? STUDIO_MAP_MEASURES.filter(([k]) => GAP_MEASURES.has(k)) : STUDIO_MAP_MEASURES), [m.held]);
  // The bottom pills: "Data up to…", then Views (CIV-3171, Ryan, 2026-11-28, picked 1: the late key moved from a pill here to
  // Measurements' Late row, which Learn more opens) by the locate-me button (CIV-3160, Ryan, 2026-11-28: "1", "Bottom, by locate me"): it only changes what
  // the map's lines are coloured to show, so it sits with the map's own controls, out of the top bar.
  const statusPill = useMemo(() => (
    <>
      <DataUpTo pill dates={m.dataDates} route={m.dataRoute} />
      <ViewsPill value={shownMeasure ?? ''} options={measureOptions} onPick={k => setMeasure(k === shownMeasure ? null : k as MapMeasure)} />
    </>
  ), [m.dataDates, m.dataRoute, shownMeasure, measureOptions]);
  const onPick = useMemo(() => (p: MapPick | null) => onMapPick.current(p), []);
  // Studio's frame owns where the map is framed (CIV-1925); Live only says when what it draws is still loading.
  const { frameKey, framedMemory, holdFrame } = useStudioMapFrame(m.frameKey !== (route ? `route-${route}` : 'network-all'));
  useEffect(() => {
    setOverlay({ layer: { kind: 'segments', model: m.model, measure: measure ?? 'late', heat: m.heat }, selected: pick, onPick, anchor: m.anchor, card: m.card, frameKey, framedMemory, holdFrame, frameCard: cardRef, statusPill });
  }, [setOverlay, m.model, measure, m.heat, pick, onPick, m.anchor, m.card, frameKey, framedMemory, holdFrame, statusPill]);
  useEffect(() => () => setOverlay(null), [setOverlay]);

  const directionMenu: StudioMenu | null = route && m.v3 && m.ids.length > 1
    ? { key: 'direction', label: DIRECTION_LABEL, value: String(m.shown), options: m.ids.map(id => [String(id), m.v3!.directionLabels[String(id)]] as const), onPick: d => { setDir(Number(d)); setPick(null); }, panelClassName: 'w-56' }
    : null;
  // CIV-3160: Views moved from here to the bottom pills (statusPill above); the top bar keeps Agency, Direction and Time.
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    // CIV-2001 (Ryan chose 1): no Route chip; the top bar's search box finds a route (StudioSearch.tsx). Supersedes CIV-1878's pick.
    directionMenu,
    { key: 'band', label: TIME_LABEL, value: band, options: periodMenuOptions(PERIOD_BANDS_ONLY.map(([k]) => k)), onPick: k => setBand(k as DashboardBand), panelClassName: 'w-56' },
  ];

  // CIV-1828 (Ryan picked option A with B's chart: "in A the chart is bad in B the chart is good"): Right now first with
  // its places named, then the week, late departures by hour and the late stops. No trip time card.
  const byKey = (keys: readonly string[]): PanelWidget[] => keys.flatMap(k => m.routeBody?.filter(w => w.key === k) ?? []);
  // CIV-2021 (Ryan): service now, gaps and bunching now, then the week's figures, then the rest, each a section headed alike.
  // Ryan, 2026-11-27 ("Should the sparkline be at the top instead … similar to how live on main map is"): late departures
  // by hour first, where the map's card has its chart, then the destination rows, then the rest.
  const topWidgets = byKey(['late-hours']);
  const routeWidgets = byKey(['loading', 'held', 'week', 'falls-behind', 'problems']);

  // CIV-2001: the top bar's search finds this page's routes; its results take the panel's place while it's open.
  const searchOpen = useStudioSearchOpen();
  const searchRoutes = useMemo(() => s.routes.map(r => ({ route: liveRouteNumber(r), longName: r.longName ?? null, routeType: r.mode ?? null })), [s.routes]);
  const regularRow = route ? s.routes.find(r => r.route === route) ?? null : null;
  const routeRow = regularRow ?? (route ? s.held.find(r => r.route === route) ?? null : null);
  const label = route ? routeLabels({ shortName: regularRow ? liveRouteNumber(regularRow) : route, longName: routeRow?.longName ?? null, mode: routeRow?.mode ?? 3, agencyName: s.agency }) : null;

  return (
    <>
      <StudioChips container={headerPortal} menus={menus} settings={route ? cutoffsSection(cutoffs, setCutoffs) : undefined} />
      {searchOpen ? (
        <StudioRouteSearch agencySlug={slug} agencyName={agencyName} routes={searchRoutes} onPick={n => m.openRoute(s.routes.find(r => liveRouteNumber(r) === n)?.route ?? n)} frameStyle={frameStyle} />
      ) : route && label ? (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={label.text}>
          <PanelBody className="px-4 pt-4 pb-2">
            <SidebarCardShell>
              <SidebarCardHeaderBlock>
                <SidebarCardHeader back={{ to: agencyName, onClick: m.backToNetwork }} title={<RouteTitleName label={label} />} />
              </SidebarCardHeaderBlock>
              {/* CIV-2021: one panel of sections (no boxes inside it), each with the shared route card's section heading. */}
              <PanelSectionsProvider>
                {/* CIV-2021: main Live's own right-now card, over the same live vehicles, steered by the Direction chip. */}
                <WidgetPanel widgets={topWidgets} className="!grid-cols-1 !gap-0" />
                <RouteRightNow slug={slug} routeShortName={regularRow ? liveRouteNumber(regularRow) : route} direction={m.v3 ? m.shown : null} />
                <WidgetPanel widgets={routeWidgets} className="!grid-cols-1 !gap-0" />
                {m.v3 && <CutoffFigures v3={m.v3} band={band} set={cutoffs} />}
              </PanelSectionsProvider>
            </SidebarCardShell>
          </PanelBody>
        </StudioPanel>
      ) : (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={agencyName}>
          <PanelBody className="px-4 pt-3 pb-3">
            {/* CIV-1878 (Ryan, "1"): one route selector, the top bar's Route chip (its list scrolls inside the chip); the panel opens with the at-a-glance lines and the week table. */}
            {/* CIV-3098 (Ryan: "Why do we have cards inside cards, which we don't use as a visual style anywhere else"): the
                agency view is one panel of sections too, as the route view is (CIV-2021); each part keeps its own title. */}
            <PanelSectionsProvider headings={false}>
              {/* No header sits above the first section here, so it drops its top rule. */}
              <div className="[&>section:first-child>div]:mt-0 [&>section:first-child>div]:border-t-0 [&>section:first-child>div]:pt-0">
                <LiveGlance s={s} band={band} />
                <WidgetPanel widgets={m.summary} className="!grid-cols-1 !gap-0" />
              </div>
            </PanelSectionsProvider>
          </PanelBody>
        </StudioPanel>
      )}
      {m.note && <MapNote>{m.note}</MapNote>}
    </>
  );
}

/**
 * The Views pill (CIV-3160): the main map's chip (ChipMenu) in the bottom pill row, its list opening upwards. A second pick
 * of the shown view clears it, as the top bar's Measure did.
 */
function ViewsPill({ value, options, onPick }: { value: string; options: typeof STUDIO_MAP_MEASURES; onPick: (k: string) => void }) {
  const { openChip, setOpenChip, toggle, rowRef } = useChipRow<'views'>();
  return (
    <div ref={rowRef}>
      <ChipMenu label={MEASURE_LABEL} active={value !== ''} open={openChip === 'views'} onToggle={() => toggle('views')} up panelClassName="" width="w-36">
        <ChipOptions value={value} onPick={k => { onPick(k); setOpenChip(null); }} options={options.map(([key, label]) => ({ key, label }))} />
      </ChipMenu>
    </div>
  );
}
