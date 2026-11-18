import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadingText, ATLAS_BYLINE, MEASURE_LABEL, ROUTE_MENU_LABEL, MAP_COLOURS_LABEL } from './content/noticeCopy';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { FEATURES } from '../shared/config';

import type { AgencySummary } from '../shared/liveAgency';
import { type DashboardBand } from '../shared/liveDashboard';
import { liveAgencyPath } from './hooks/useLiveDashboard';
import { useLiveAgency } from './LiveAgencyPage';
import { devOnly, liveReportTitle } from './lib/liveReportData';
import { applySeoToDocument } from './lib/seoDom';
import { syncUrlParams } from './utils/syncUrlParams';
import { LIVE_TOOL_URL, currentSearch, linkUpdate, readLink } from './utils/urlSchema';
import { DIRECTION_LABEL, TIME_OF_DAY_LABEL } from '../shared/liveWording';
import LiveOffNotice from './components/LiveOffNotice';
import AtlasLogo from './components/AtlasLogo';
import { MapAppShell, MapAppHeader, MapAppLayout, MapAppMap, MapAppFooter, PillMenu, MAP_APP_PADDING, framePadding, useMapAppWide, type MapPick } from './components/MapApp';
import { MapLegendCard } from './components/ui/MapLegendCard';
import { type MapMeasure } from './components/Live/routeMapModel';
import WidgetPanel from './components/Live/tool/WidgetPanel';
import { PERIOD_BANDS_ONLY } from './components/Live/sections/figures';
import { liveBandNow } from './components/Live/liveBandNow';
import { useAgencies } from './hooks/useAgencies';
import Pill from './components/ui/Pill';
import PillGroup from './components/ui/PillGroup';
import LiveMapKey from './components/Live/LiveMapKey';
import LiveBackLink from './components/Live/LiveBackLink';
import { PHONE_TAP_AREA } from './styles';
import { useLiveBody } from './components/Live/tool/useLiveBody';
import { MAP_MEASURES } from './components/Live/routeMapModel';
import { DataUpTo } from './LiveRoutePage';



function MeasurePills({ measure, setMeasure, options = MAP_MEASURES }: { measure: MapMeasure; setMeasure: (m: MapMeasure) => void; options?: ReadonlyArray<readonly [MapMeasure, string]> }) {
  // The main map's own option set (CIV-1828: one switcher style, never a copy).
  return <PillGroup outlined label={MEASURE_LABEL} options={options} value={measure} onChange={setMeasure} />;
}

/** The time of day as one pill showing the current period; a click opens a small menu with the five choices. */
export function PeriodMenu({ band, setBand }: { band: DashboardBand; setBand: (b: DashboardBand) => void }) {
  return <PillMenu label={TIME_OF_DAY_LABEL} value={band} options={PERIOD_BANDS_ONLY} onPick={k => setBand(k as DashboardBand)} />;
}


/**
 * The whole screen under the top bar: the map always, the overview on the left, the widgets on the right. Also the body
 * of Studio's Live page (CIV-1828), which passes its own measures (STUDIO_MAP_MEASURES, "Falls behind" first).
 */
export function Body({ agency, agencyName, pickSlot, measureSlot, s, route, setRoute, dir, setDir, dirSlot, dataSlot, band, measure, setMeasure, pick, setPick, measures }: {
  agency: string; /** The agency's short name, for the back link. */ agencyName: string; pickSlot: HTMLElement | null; measureSlot: HTMLElement | null; dirSlot: HTMLElement | null; dataSlot: HTMLElement | null; s: AgencySummary; route: string | null; setRoute: (r: string | null) => void; dir: number | null; setDir: (d: number | null) => void; band: DashboardBand; measure: MapMeasure; setMeasure: (m: MapMeasure) => void; pick: MapPick | null; setPick: (p: MapPick | null) => void;
  /** The measure pills, in order (default: the Live tool's). */ measures?: ReadonlyArray<readonly [MapMeasure, string]>;
}) {
  const wide = useMapAppWide();
  // On a phone the map sits above the widgets: a stop or stretch picked lower down (a "Stops most often late" row)
  // brings the map back into view so its card shows (#1151).
  const narrowScroll = useRef<HTMLDivElement | null>(null);
  const pickKey = pick ? (pick.kind === 'stop' ? pick.stopId : pick.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : pick.id) : null;
  useEffect(() => { if (!wide && pickKey) narrowScroll.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [pickKey, wide]);
  const m = useLiveBody({ agency, agencyName, s, route, setRoute, dir, setDir, band, measure, pick, setPick });
  // The map note sits over the map's bottom edge: the route is framed above it (its measured height plus its inset and a gap).
  const [noteH, setNoteH] = useState(0);
  // The bottom of the map: the note (when it applies) above the key's row of pills. The route is framed above both.
  const note = <MapAppFooter note={m.note} onHeight={setNoteH} />;
  const mapEl = (
    <MapAppMap
      layer={{ kind: 'segments', model: m.model, measure, heat: m.heat }} selected={pick} anchor={m.anchor} card={m.card} padding={framePadding(wide ? MAP_APP_PADDING.wide : MAP_APP_PADDING.narrow, noteH)}
      onPick={m.onMapPick}
      frameKey={m.ready && route ? `${m.frameKey}-${noteH}` : m.frameKey}
    />
  );
  // The direction switch sits in the top bar with the other pills.
  // One pill showing the current direction; a click switches to the other.
  const direction = m.ids.length > 1 && dirSlot ? createPortal(<Pill size="segment" selected className={PHONE_TAP_AREA} aria-label={DIRECTION_LABEL} onClick={() => { setDir(m.ids[(m.ids.indexOf(m.shown) + 1) % m.ids.length]); setPick(null); }}>{m.v3!.directionLabels[String(m.shown)]}</Pill>, dirSlot) : null;
  // The route menu at the right end of the top bar: the panel list's routes in its order, plus All routes; a pick sets route= as a list click does.
  const routeMenu = pickSlot ? createPortal(<PillMenu label={ROUTE_MENU_LABEL} alignRight active={!!route} value={route ?? ''} options={m.routeOptions} onPick={r => { if (r) m.openRoute(r); else m.backToNetwork(); }} />, pickSlot) : null;
  // The newest day in the figures, in the header: the picked route's, or the network summary's week.
  const upTo = dataSlot ? createPortal(<DataUpTo dates={m.dataDates} route={m.dataRoute} />, dataSlot) : null;
  // The measures sit in the top bar with the other switchers; the map key sits in the regular map's key card and slot (CIV-1821).
  const measureBar = measureSlot ? createPortal(<MeasurePills measure={measure} setMeasure={setMeasure} options={measures} />, measureSlot) : null;
  const mapOverlay = <><MapLegendCard label={MAP_COLOURS_LABEL}><LiveMapKey measure={measure} variant="card" /></MapLegendCard>{note}</>;
  // Narrow screens: the map on top, the widgets under it; the page scrolls, no panel does.
  return (
    <MapAppLayout
      wide={wide}
      portals={<>{direction}{upTo}{routeMenu}{measureBar}</>}
      narrowScrollRef={narrowScroll}
      map={mapEl}
      overlay={mapOverlay}
      sidebar={m.routePanel ? <WidgetPanel widgets={m.routePanel} /> : m.networkLossWidget ? <WidgetPanel widgets={[m.networkLossWidget, ...m.summary]} /> : <><WidgetPanel widgets={m.summary} />{m.overview}</>}
      narrowPanels={<>
        <WidgetPanel className="p-3" widgets={m.routePanel ?? (m.networkLossWidget ? [m.networkLossWidget, ...m.summary] : m.summary)} />
        {!m.routePanel && !m.networkLossWidget && <div className="flex p-3 pt-0">{m.overview}</div>}
      </>}
    />
  );
}


/** The Live planner: the map always, the agency overview on the left, widgets that follow the selection on the right. State is in the address. */
export default function LiveToolPage() {
  const { agency = '' } = useParams();
  const agencyName = useLiveAgencyName(agency);
  const state = useLiveAgency(FEATURES.liveReports ? agency : '');
  const [link] = useState(() => readLink(currentSearch(), LIVE_TOOL_URL));
  const [route, setRoute] = useState<string | null>(() => link.route ?? null);
  const [dir, setDir] = useState<number | null>(() => link.dir ?? null);
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => link.band ?? liveBandNow(agencies.find(a => a.slug === agency)?.timezone));
  const [measure, setMeasure] = useState<MapMeasure>(() => link.measure ?? 'late');
  const [dirSlot, setDirSlot] = useState<HTMLElement | null>(null);
  const [dataSlot, setDataSlot] = useState<HTMLElement | null>(null);
  const [pickSlot, setPickSlot] = useState<HTMLElement | null>(null);
  const [measureSlot, setMeasureSlot] = useState<HTMLElement | null>(null);
  const [pick, setPick] = useState<MapPick | null>(() => {
    if (link.stop) return { kind: 'stop', stopId: link.stop };
    const [f, t] = (link.segment ?? '').split('>');
    return f && t ? { kind: 'segment', fromStopId: f, toStopId: t } : null;
  });
  useEffect(() => {
    syncUrlParams(linkUpdate(LIVE_TOOL_URL, {
      view: null, tab: null, route, dir, band, measure,
      stop: pick?.kind === 'stop' ? pick.stopId : null, segment: pick?.kind === 'segment' ? `${pick.fromStopId}>${pick.toStopId}` : null,
    }));
  }, [route, dir, band, measure, pick]);
  useEffect(() => { applySeoToDocument(document, { title: liveReportTitle(agencyName), description: '', canonicalUrl: window.location.href, noindex: true, matchedPath: window.location.pathname }); }, [agencyName]);
  if (!FEATURES.liveReports) return <LiveOffNotice report />;
  const shell = (body: ReactNode) => <MapAppShell>{body}</MapAppShell>;
  // CIV-1413 C: a page without figures keeps the top bar's Atlas logo and the "← agency" link every Live page has in all states (CIV-1446).
  const bare = (line: ReactNode, busy = false) => shell(
    <>
      <MapAppHeader><AtlasLogo href="/" ariaLabel={ATLAS_BYLINE} showMark={false} /></MapAppHeader>
      <div className="p-6">
        <LiveBackLink agencyName={agencyName} href={liveAgencyPath(agency)} />
        <p className="mt-3 text-sm text-[var(--text-muted)]" aria-busy={busy || undefined}>{line}</p>
      </div>
    </>,
  );
  if (state.kind === 'loading') return bare(loadingText(agencyName), true);
  if (state.kind === 'error') return bare(state.reason);
  if (state.data.status !== 'ready') return bare(state.data.status === 'no_analysis' ? devOnly(state.data.reason) : state.data.reason);
  const s = state.data.summary;
  return shell(
    <>
      <MapAppHeader>
        <AtlasLogo href="/" ariaLabel={ATLAS_BYLINE} showMark={false} />
        <button type="button" onClick={() => { setRoute(null); setDir(null); setPick(null); }} className="text-sm font-bold hover:underline">{agencyName}</button>
        <div ref={setDirSlot} className="contents" />
        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--border-primary)]" />
        <div ref={setMeasureSlot} className="contents" />
        {/* The data date, the route menu and the time of day at the right end of the top bar (Ryan, 2026-10-26). */}
        <div className="ml-auto flex items-center gap-3"><div ref={setDataSlot} className="contents" /><div ref={setPickSlot} className="contents" /><PeriodMenu band={band} setBand={setBand} /></div>
      </MapAppHeader>
      <Body agency={agency} agencyName={agencyName} pickSlot={pickSlot} measureSlot={measureSlot} dirSlot={dirSlot} dataSlot={dataSlot} s={s} route={route} setRoute={setRoute} dir={dir} setDir={setDir} band={band} measure={measure} setMeasure={setMeasure} pick={pick} setPick={setPick} />
    </>,
  );
}
