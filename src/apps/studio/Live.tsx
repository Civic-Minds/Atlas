import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MAP_COLOURS_LABEL, MEASURE_LABEL, ROUTE_MENU_LABEL, SEARCH_ROUTES_PLACEHOLDER, TIME_LABEL, loadingText } from '../../content/noticeCopy';
import { RouteTitleName } from '../../components/RouteRowName';
import Panel, { PanelBody } from '../../components/ui/Panel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import { MapLegendCard } from '../../components/ui/MapLegendCard';
import { MapNote } from '../../components/ui/MapNote';
import LiveMapKey from '../../components/Live/LiveMapKey';
import { STUDIO_MAP_MEASURES, type MapMeasure } from '../../components/Live/routeMapModel';
import { PERIOD_BANDS_ONLY } from '../../components/Live/sections/figures';
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
import { SIDEBAR_CARD_ABOVE_KEY } from '../../mapOverlayLayout';
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
  /** Right after the Live tab: where the Measure picker sits (CIV-1886). */
  measureSlot: Element | null;
  /** The sidebar card's place, from the Studio frame (useSidebarFrame), as History's panels. */
  frameStyle: CSSProperties;
}

export default function Live({ slug, route, setRoute, agencyMenu, headerPortal, measureSlot, frameStyle }: LiveProps) {
  const agencyName = useLiveAgencyName(slug);
  const state = useLiveAgency(slug);
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => liveBandNow(agencies.find(a => a.slug === slug)?.timezone));
  const waiting = state.kind === 'loading' ? loadingText(agencyName) : state.kind === 'error' ? state.reason : state.data.status !== 'ready' ? state.data.reason : null;
  if (state.kind !== 'done' || state.data.status !== 'ready') {
    return (
      <>
        <StudioChips container={headerPortal} menus={[agencyMenu]} />
        <Panel sidebar enter style={frameStyle}><PanelEmpty>{waiting}</PanelEmpty></Panel>
      </>
    );
  }
  return <Ready slug={slug} agencyName={agencyName} s={state.data.summary} route={route} setRoute={setRoute} band={band} setBand={setBand} agencyMenu={agencyMenu} headerPortal={headerPortal} measureSlot={measureSlot} frameStyle={frameStyle} />;
}

function Ready({ slug, agencyName, s, route, setRoute, band, setBand, agencyMenu, headerPortal, measureSlot, frameStyle }: Omit<LiveProps, 'route'> & {
  agencyName: string; s: Parameters<typeof useLiveBody>[0]['s']; route: string | null; band: DashboardBand; setBand: (b: DashboardBand) => void;
}) {
  const [measure, setMeasure] = useState<MapMeasure | null>(null);
  const [dir, setDir] = useState<number | null>(null);
  const [pick, setPick] = useState<MapPick | null>(null);
  // A planner's own cut-offs (CIV-1886), kept across routes while Studio is open.
  const [cutoffs, setCutoffs] = useState<SetCutoffs>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const pickRoute = (r: string | null) => { setRoute(r); if (!r) setDir(null); setPick(null); };
  const m = useLiveBody({ agency: slug, agencyName, s, route, setRoute: pickRoute, dir, setDir, band, measure, pick, setPick });

  // The page overlay: the map draws Live's segments, the pick's card follows its anchor. The overlay's pick callback is kept
  // in a ref: a new one each render would redraw the map every time.
  const onMapPick = useRef(m.onMapPick);
  onMapPick.current = m.onMapPick;
  const { setOverlay } = usePageMapOverlay();
  const onPick = useMemo(() => (p: MapPick | null) => onMapPick.current(p), []);
  // Studio's frame owns where the map is framed (CIV-1925); Live only says when what it draws is still loading.
  const { frameKey, framedMemory, holdFrame } = useStudioMapFrame(m.frameKey !== (route ? `route-${route}` : 'network-all'));
  useEffect(() => {
    setOverlay({ layer: { kind: 'segments', model: m.model, measure: measure ?? 'late', heat: m.heat }, selected: pick, onPick, anchor: m.anchor, card: m.card, frameKey, framedMemory, holdFrame, frameCard: cardRef });
  }, [setOverlay, m.model, measure, m.heat, pick, onPick, m.anchor, m.card, frameKey, framedMemory, holdFrame]);
  useEffect(() => () => setOverlay(null), [setOverlay]);

  const directionMenu: StudioMenu | null = route && m.v3 && m.ids.length > 1
    ? { key: 'direction', label: DIRECTION_LABEL, value: String(m.shown), options: m.ids.map(id => [String(id), m.v3!.directionLabels[String(id)]] as const), onPick: d => { setDir(Number(d)); setPick(null); }, panelClassName: 'w-56' }
    : null;
  const measureMenu: StudioMenu = { key: 'measure', label: MEASURE_LABEL, value: measure ?? '', options: STUDIO_MAP_MEASURES, onPick: k => setMeasure(k === measure ? null : k as MapMeasure), active: measure != null, panelClassName: '', width: 'w-36', arrow: true };
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    { key: 'route', label: ROUTE_MENU_LABEL, value: route ?? '', options: m.routeOptions, searchPlaceholder: SEARCH_ROUTES_PLACEHOLDER, onPick: r => (r ? m.openRoute(r) : m.backToNetwork()), active: route != null, panelClassName: 'w-64 max-h-[70vh] overflow-y-auto' },
    directionMenu,
    { key: 'band', label: TIME_LABEL, value: band, options: PERIOD_BANDS_ONLY, onPick: k => setBand(k as DashboardBand), panelClassName: 'w-48' },
    route ? cutoffsMenu(cutoffs, setCutoffs) : null,
  ];

  const routeRow = route ? s.routes.find(r => r.route === route) : null;
  const label = route ? routeLabels({ shortName: route, longName: routeRow?.longName ?? null, mode: routeRow?.mode ?? 3, agencyName: s.agency }) : null;
  const dataUpTo = <div className="shrink-0 px-4 pt-3"><DataUpTo dates={m.dataDates} route={m.dataRoute} /></div>;

  return (
    <>
      <StudioChips container={headerPortal} menus={menus} />
      <StudioChips container={measureSlot} menus={[measureMenu]} />
      {route && label ? (
        <Panel sidebar wide enter ref={cardRef} className={SIDEBAR_CARD_ABOVE_KEY} style={frameStyle} aria-label={label.text}>
          <PanelBody className="px-4 pt-4 pb-2">
            <SidebarCardShell>
              <SidebarCardHeaderBlock>
                <SidebarCardHeader back={{ to: agencyName, onClick: m.backToNetwork }} title={<RouteTitleName label={label} />} />
              </SidebarCardHeaderBlock>
              <DataUpTo dates={m.dataDates} route={m.dataRoute} />
              <RouteNow agency={slug} route={route} />
              {m.routeBody && <WidgetPanel widgets={m.routeBody} />}
              {m.v3 && <CutoffFigures v3={m.v3} band={band} set={cutoffs} />}
            </SidebarCardShell>
          </PanelBody>
        </Panel>
      ) : (
        <Panel sidebar wide enter ref={cardRef} className={SIDEBAR_CARD_ABOVE_KEY} style={frameStyle} aria-label={agencyName}>
          {dataUpTo}
          <PanelBody className="px-3 pt-3 pb-3">
            {/* CIV-1878 (Ryan, "1"): one route selector, the top bar's Route chip (its list scrolls inside the chip); the panel opens with the at-a-glance lines and the week table. */}
            <LiveGlance s={s} days={m.networkDates} />
            <WidgetPanel widgets={m.summary} />
          </PanelBody>
        </Panel>
      )}
      {measure && <MapLegendCard label={MAP_COLOURS_LABEL}><LiveMapKey measure={measure} variant="card" /></MapLegendCard>}
      {m.note && <MapNote>{m.note}</MapNote>}
    </>
  );
}
