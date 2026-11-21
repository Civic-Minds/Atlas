import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_COLOURS_LABEL, TIME_LABEL } from '../../content/noticeCopy';
import RouteRowName, { RouteTitleName } from '../../components/RouteRowName';
import MapKey from '../../components/ui/MapKey';
import { PanelBody, PanelTitleBar } from '../../components/ui/Panel';
import StudioPanel from './StudioPanel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import ViewLoadingPanel from '../../components/ViewLoadingPanel';
import { MapLegendCard } from '../../components/ui/MapLegendCard';
import { CardBodyText, CardSectionLabel, SidebarCardHeader, SidebarCardHeaderBlock, SidebarCardSection, SidebarCardShell } from '../../components/Interval/cardUi';
import RouteListRow, { RouteListColumns, RouteListHeader } from '../../components/RouteListRow';
import AgencyGroupHeader from '../../components/ui/AgencyGroupHeader';
import { LIST_ROW_DIM } from '../../styles';
import { usePageMapOverlay, type MapPick } from '../../context/PageMapOverlay';
import { useStudioMapFrame } from './StudioMapFrame';
import { PERIOD_KEYS, type PeriodKey } from '../../../shared/config';
import { periodMenuOptions } from '../../components/Interval/pickers';
import { PAGE_NAMES } from '../../../shared/pageNames';
import { capitalizeFirst } from '../../../shared/headwayText';
import { dateRange, shortDate } from '../../../shared/dateText';
import { dayInSentence, dayPlural } from '../../../shared/dayTypes';
import { joinList } from '../../../shared/overflowText';
import { pairedStudioFile, studioBeforeAfterDevUrl, type StudioBeforeAfterFile } from '../../../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioVehiclesFile } from '../../../shared/studioVehicles';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT, fleetIntroText, vehiclesTitleText } from '../../../shared/studioWording';
import { StudioRouteTable, periodCell, routeTitle } from './StudioRouteTable';
import { StudioGroupFigures } from './StudioGroupFigures';
import { CHANGE_COLOR, DEFAULT_PERIOD, agencyFleet, changeGroups, groupFor, routeChangeAt, rowFigure, studioMapLines } from './fleetModel';
import StudioChips, { type StudioMenu } from './StudioChips';
import { useDevFile } from './useDevFile';

/**
 * Fleet (CIV-1828, a placeholder name) and Schedules, two pages of Atlas Studio on the main map (CIV-1922: Fleet
 * leads with the fleet, Schedules is its own page). Fleet: the agency's buses needed and, for an open route, the
 * buses its group needs (CIV-1693, CIV-1827). Schedules: how the agency's schedule changed between two files
 * (CIV-1715, CIV-1806). The sidebar is
 * the main map's card (Panel sidebar), the map draws through the page overlay, the key sits in the map's key slot.
 * Local only (FEATURES.studio): both files come from scripts run on this Mac and are served by the Vite dev server.
 */

const T = STUDIO_MAP_TEXT;
const C = STUDIO_CHANGES_TEXT;

/** The change list: every changed route by group; a click opens the route. Only the rows scroll. */
function ChangeList({ file, period, route, onPick }: { file: StudioBeforeAfterFile; period: PeriodKey; route: string | null; onPick: (r: string) => void }) {
  const groups = useMemo(() => changeGroups(file), [file]);
  // CIV-2003: the main map's route rows (RouteListRow), headings and panel body; one column per compared date, each value
  // under its date (CIV-1806); the time of day is the top bar's.
  return (
    <section aria-label={T.routes} className="flex min-h-0 flex-1 flex-col">
      <RouteListHeader label={T.routes} columns={[dateRange(file.before.date, file.before.date), dateRange(file.after.date, file.after.date)]} />
      <PanelBody className="pb-2">
        {groups.map((g, i) => (
          <div key={g.key}>
            <AgencyGroupHeader rule={i === 0 ? 'none' : 'above'}>{g.title}</AgencyGroupHeader>
            {g.routes.map(c => {
              const l = routeTitle(c);
              const f = rowFigure(c, period);
              // One short figure per cell, a late start or early end on its own line (CIV-1922). No bold on the newer
              // figure (Ryan, CIV-1806: "Does bold mean better frequency?").
              const cells = (['before', 'after'] as const).map(side => (PERIOD_KEYS as readonly string[]).includes(f.key) ? periodCell(c[side], f.key as PeriodKey) : { main: f[side], note: null });
              return (
                <RouteListRow key={c.route} shortName={l.primary} name={l.secondary ?? undefined} dotColor={CHANGE_COLOR[routeChangeAt(file, c.route, period)]}
                  subtitle={f.label ? <span className={`block ${LIST_ROW_DIM}`}>{f.label}</span> : undefined}
                  right={<RouteListColumns cells={cells} />} selected={c.route === route} onClick={() => onPick(c.route)} />
              );
            })}
          </div>
        ))}
        {file.unchanged.length > 0 && <CardBodyText className="px-4">{C.unchangedCount(file.unchanged.length)}</CardBodyText>}
      </PanelBody>
    </section>
  );
}

/** The map key in the regular map's key card and slot, bottom left above the footer (CIV-1821). */
function FleetMapKey({ beforeDate, afterDate }: { beforeDate: string; afterDate: string }) {
  const steps = (['more', 'less', 'same', 'none'] as const).map(k => ({ color: CHANGE_COLOR[k], label: T[k], className: 'text-xs text-[var(--text-primary)]' }));
  // CIV-1827: which line is which schedule, by its date (the change list's headers).
  const grey = CHANGE_COLOR.same;
  const sides = [
    { color: grey, label: dateRange(afterDate, afterDate), className: 'text-xs text-[var(--text-primary)]', swatchClassName: 'w-5' },
    { color: `repeating-linear-gradient(90deg, ${grey} 0 4px, transparent 4px 7px)`, label: dateRange(beforeDate, beforeDate), className: 'text-xs text-[var(--text-primary)]', swatchClassName: 'w-5 !rounded-none' },
  ];
  return (
    <MapLegendCard label={MAP_COLOURS_LABEL}>
      <CardSectionLabel className="!mb-1.5">{T.keyTitle}</CardSectionLabel>
      <MapKey stepsClassName="grid grid-cols-2 gap-x-2 gap-y-0.5" steps={steps} />
      <MapKey stepsClassName="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5" steps={sides} />
    </MapLegendCard>
  );
}

/** Which of the two pages this is. */
export type FleetView = 'fleet' | 'schedules';

export interface FleetProps {
  /** Fleet, or the Schedules page that shares its map and data. */
  view?: FleetView;
  slug: string;
  /** The agency's short name. */
  agency: string;
  route: string | null;
  setRoute: (r: string | null) => void;
  /** The agency menu, the shell's, first in the top bar. */
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  /** The sidebar card's place, from the Studio frame (useSidebarFrame), as History's panels. */
  frameStyle: React.CSSProperties;
}

export default function Fleet({ view = 'fleet', slug, agency, route, setRoute, agencyMenu, headerPortal, frameStyle }: FleetProps) {
  const file = useDevFile<StudioBeforeAfterFile>(studioBeforeAfterDevUrl(slug));
  const vehicles = useDevFile<StudioVehiclesFile>(studioVehiclesDevUrl(slug));
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  // CIV-1868: a route written differently in the two schedules is one changed route (the MCP's pairing).
  const ready = useMemo(() => (file && file !== 'missing' ? pairedStudioFile(file) : null), [file]);
  // The times of day either file has figures for.
  const periods = PERIOD_KEYS.filter(k => (vehicles && vehicles !== 'missing' && vehicles.periods[k]?.length)
    || (ready && ready.changes.some(c => c.before?.headway[k] != null || c.after?.headway[k] != null)));
  const routeOptions = useMemo(() => (ready ? [['', T.allRoutes] as const, ...[...new Set([...Object.keys(ready.lines?.after ?? {}), ...Object.keys(ready.lines?.before ?? {})])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(r => { const l = routeTitle({ route: r, name: ready.changes.find(c => c.route === r)?.name ?? null }); return [r, <RouteRowName key={r} shortName={l.primary} name={l.secondary} />, l.text] as const; })] : []), [ready]);
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    ready ? { key: 'route', label: T.route, value: route ?? '', options: routeOptions, onPick: r => setRoute(r || null), active: route != null, panelClassName: 'w-64 max-h-[70vh] overflow-y-auto' } : null,
    periods.length ? { key: 'period', label: TIME_LABEL, value: period, options: periodMenuOptions(periods), onPick: k => setPeriod(k as PeriodKey), panelClassName: 'w-56' } : null,
  ];
  return (
    <>
      <StudioChips container={headerPortal} menus={menus} />
      {/* The shared loading panel while the file comes in, then the shared empty line if there is none (CIV-1925 phase 4). */}
      {file == null && <ViewLoadingPanel what={agency} />}
      {file === 'missing' && <StudioPanel style={frameStyle}><PanelEmpty>{C.noData}</PanelEmpty></StudioPanel>}
      {ready && <Body view={view} file={ready} vehicles={vehicles} agency={agency} period={period} route={route} setRoute={setRoute} frameStyle={frameStyle} />}
    </>
  );
}

function Body({ view, file, vehicles, agency, period, route, setRoute, frameStyle }: {
  view: FleetView; file: StudioBeforeAfterFile; vehicles: StudioVehiclesFile | null | 'missing'; agency: string; period: PeriodKey; route: string | null; setRoute: (r: string | null) => void; frameStyle: React.CSSProperties;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Fleet's map has no change story: the newer schedule's lines in one colour (its route list is Schedules').
  const lines = useMemo(() => {
    const all = studioMapLines(file, period, route);
    return view === 'schedules' ? all : all.filter(l => !l.dashed).map(l => ({ ...l, color: CHANGE_COLOR.same }));
  }, [file, period, route, view]);
  // The map's pick in a ref: a new callback each render would redraw the overlay every time.
  const setRouteRef = useRef(setRoute);
  setRouteRef.current = setRoute;
  const onPick = useMemo(() => (p: MapPick | null) => { if (p?.kind === 'line' && p.route) setRouteRef.current(p.route); }, []);
  const { setOverlay } = usePageMapOverlay();
  // Studio's frame owns where the map is framed (CIV-1925).
  const { frameKey, framedMemory, holdFrame } = useStudioMapFrame();
  useEffect(() => {
    setOverlay({ layer: { kind: 'lines', lines }, selected: null, onPick, highlightRoute: route, frameKey, framedMemory, holdFrame, frameCard: cardRef });
  }, [setOverlay, lines, onPick, route, frameKey, framedMemory, holdFrame]);
  useEffect(() => () => setOverlay(null), [setOverlay]);

  const change = route ? file.changes.find(c => c.route === route) ?? null : null;
  const intro = file.day ? C.intro(agency, dayInSentence(file.day), shortDate(file.before.date) ?? file.before.date, shortDate(file.after.date) ?? file.after.date) : C.noDay;
  const leftOut = (['after', 'before'] as const).map(side => {
    const days = file.leftOut.filter(l => l.sides.includes(side)).map(l => capitalizeFirst(dayPlural(l.day)));
    return days.length ? C.leftOut(joinList(days), side === 'after') : null;
  }).filter((n): n is string => !!n);
  const routeLabel = route ? routeTitle({ route, name: change?.name ?? null }) : null;

  return (
    <>
      {route && routeLabel ? (
        // CIV-1827: one card for the open route, as the main map's route card: the way back, the route's name, what
        // changed between the two dates, then what running it at other frequencies takes.
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={routeLabel.text}>
          <PanelBody className="px-4 pt-4 pb-2">
            <SidebarCardShell>
              <SidebarCardHeaderBlock>
                <SidebarCardHeader back={{ to: agency, onClick: () => setRoute(null) }} title={<RouteTitleName label={routeLabel} />} />
              </SidebarCardHeaderBlock>
              {view === 'schedules' && change && (
                <SidebarCardSection label={PAGE_NAMES.studioSchedules}>
                  <StudioRouteTable change={change} beforeDate={file.before.date} afterDate={file.after.date} period={period} />
                </SidebarCardSection>
              )}
              {view === 'fleet' && (
                <SidebarCardSection label={vehiclesTitleText(dateRange(file.after.date, file.after.date)) || PAGE_NAMES.studioVehicles}>
                  {/* CIV-2003: a line inside the card is the card's body text. */}
                  {vehicles === 'missing' ? <CardBodyText className="!mt-0">{C.noData}</CardBodyText>
                    : vehicles ? <StudioGroupFigures group={groupFor(vehicles, route, period)} /> : null}
                </SidebarCardSection>
              )}
            </SidebarCardShell>
          </PanelBody>
        </StudioPanel>
      ) : view === 'fleet' ? (
        // CIV-1922: Fleet opens on the fleet itself, the buses the whole agency needs at the time of day.
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={PAGE_NAMES.studioVehicles}>
          <PanelTitleBar title={PAGE_NAMES.studioVehicles} />
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            <p className="m-0 mb-2 text-sm">{fleetIntroText(agency, shortDate(file.after.date) ?? file.after.date)}</p>
            {vehicles === 'missing' ? <p className="m-0 text-sm text-[var(--text-muted)]">{C.noData}</p>
              : vehicles ? <StudioGroupFigures group={agencyFleet(vehicles, period)} showRunning={false} /> : null}
          </div>
        </StudioPanel>
      ) : (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={PAGE_NAMES.studioSchedules}>
          <PanelTitleBar title={PAGE_NAMES.studioSchedules} />
          <div className="shrink-0 px-4 pt-2">
            <CardBodyText>{intro}</CardBodyText>
            {leftOut.map(n => <CardBodyText key={n}>{n}</CardBodyText>)}
          </div>
          <ChangeList file={file} period={period} route={route} onPick={setRoute} />
        </StudioPanel>
      )}
      {view === 'schedules' && <FleetMapKey beforeDate={file.before.date} afterDate={file.after.date} />}
    </>
  );
}
