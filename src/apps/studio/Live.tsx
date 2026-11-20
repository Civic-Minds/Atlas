import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MAP_COLOURS_LABEL, MEASURE_LABEL, ROUTE_MENU_LABEL, SEARCH_ROUTES_PLACEHOLDER, TIME_LABEL } from '../../content/noticeCopy';
import ViewLoadingPanel from '../../components/ViewLoadingPanel';
import { RouteTitleName } from '../../components/RouteRowName';
import { PanelBody } from '../../components/ui/Panel';
import StudioPanel from './StudioPanel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import { MapLegendCard } from '../../components/ui/MapLegendCard';
import { MapNote } from '../../components/ui/MapNote';
import LiveMapKey from '../../components/Live/LiveMapKey';
import { STUDIO_MAP_MEASURES, type MapMeasure } from '../../components/Live/routeMapModel';
import { PERIOD_BANDS_ONLY } from '../../components/Live/sections/figures';
import { periodMenuOptions } from '../../components/Interval/pickers';
import { liveBandNow } from '../../components/Live/liveBandNow';
import WidgetPanel from '../../components/Live/tool/WidgetPanel';
import { useLiveBody } from '../../components/Live/tool/useLiveBody';
import { SidebarCardHeader, SidebarCardHeaderBlock, SidebarCardShell } from '../../components/Interval/cardUi';
import { usePageMapOverlay, type MapPick } from '../../context/PageMapOverlay';
import { useStudioMapFrame } from './StudioMapFrame';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveAgencyName } from '../../hooks/useLiveAgencyName';
import { useLiveAgency } from '../../LiveAgencyPage';
import { DataUpTo } from '../../LiveRoutePage';
import { routeLabels } from '../../utils/format';
import type { DashboardBand } from '../../../shared/liveDashboard';
import { DIRECTION_LABEL } from '../../../shared/liveWording';
import LiveGlance from './LiveGlance';
import RouteNow from './RouteNow';
import StudioChips, { type StudioMenu } from './StudioChips';
import { CutoffFigures, cutoffsMenu, type SetCutoffs } from './StudioCutoffs';

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
  /** The agency menu, the shell's, first in the top bar. */
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  /** The sidebar card's place, from the Studio frame (useSidebarFrame), as History's panels. */
  frameStyle: CSSProperties;
}

export default function Live({ slug, route, setRoute, agencyMenu, headerPortal, frameStyle }: LiveProps) {
  const agencyName = useLiveAgencyName(slug);
  const state = useLiveAgency(slug);
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

function Ready({ slug, agencyName, s, route, setRoute, band, setBand, agencyMenu, headerPortal, frameStyle }: Omit<LiveProps, 'route'> & {
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
  const statusPill = useMemo(() => <DataUpTo pill dates={m.dataDates} route={m.dataRoute} />, [m.dataDates, m.dataRoute]);
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
  const measureMenu: StudioMenu = { key: 'measure', label: MEASURE_LABEL, value: measure ?? '', options: STUDIO_MAP_MEASURES, onPick: k => setMeasure(k === measure ? null : k as MapMeasure), active: measure != null, panelClassName: '', width: 'w-36', arrow: true };
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    { key: 'route', label: ROUTE_MENU_LABEL, value: route ?? '', options: m.routeOptions, searchPlaceholder: SEARCH_ROUTES_PLACEHOLDER, onPick: r => (r ? m.openRoute(r) : m.backToNetwork()), active: route != null, panelClassName: 'w-64 max-h-[70vh] overflow-y-auto' },
    directionMenu,
    { key: 'band', label: TIME_LABEL, value: band, options: periodMenuOptions(PERIOD_BANDS_ONLY.map(([k]) => k)), onPick: k => setBand(k as DashboardBand), panelClassName: 'w-56' },
    // With the filters: Agency, Route, Time of day, Measure (Ryan, 2026-11-19; it sat beside the Live tab since CIV-1886).
    measureMenu,
    route ? cutoffsMenu(cutoffs, setCutoffs) : null,
  ];

  const routeRow = route ? s.routes.find(r => r.route === route) : null;
  const label = route ? routeLabels({ shortName: route, longName: routeRow?.longName ?? null, mode: routeRow?.mode ?? 3, agencyName: s.agency }) : null;

  return (
    <>
      <StudioChips container={headerPortal} menus={menus} />
      {route && label ? (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={label.text}>
          <PanelBody className="px-4 pt-4 pb-2">
            <SidebarCardShell>
              <SidebarCardHeaderBlock>
                <SidebarCardHeader back={{ to: agencyName, onClick: m.backToNetwork }} title={<RouteTitleName label={label} />} />
              </SidebarCardHeaderBlock>
              <RouteNow agency={slug} route={route} />
              {m.routeBody && <WidgetPanel widgets={m.routeBody} />}
              {m.v3 && <CutoffFigures v3={m.v3} band={band} set={cutoffs} />}
            </SidebarCardShell>
          </PanelBody>
        </StudioPanel>
      ) : (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={agencyName}>
          <PanelBody className="px-4 pt-3 pb-3">
            {/* CIV-1878 (Ryan, "1"): one route selector, the top bar's Route chip (its list scrolls inside the chip); the panel opens with the at-a-glance lines and the week table. */}
            <LiveGlance s={s} days={m.networkDates} />
            <WidgetPanel widgets={m.summary} />
          </PanelBody>
        </StudioPanel>
      )}
      {measure && <MapLegendCard label={MAP_COLOURS_LABEL}><LiveMapKey measure={measure} variant="card" /></MapLegendCard>}
      {m.note && <MapNote>{m.note}</MapNote>}
    </>
  );
}
