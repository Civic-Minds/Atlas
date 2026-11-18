import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_COLOURS_LABEL } from '../../content/noticeCopy';
import RouteRowName, { RouteTitleName } from '../../components/RouteRowName';
import MapKey from '../../components/ui/MapKey';
import Panel, { PanelBody, PanelTitleBar } from '../../components/ui/Panel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import { MapLegendCard } from '../../components/ui/MapLegendCard';
import { SIDEBAR_CARD_ABOVE_KEY } from '../../mapOverlayLayout';
import { SidebarCardHeader, SidebarCardHeaderBlock, SidebarCardSection, SidebarCardShell } from '../../components/Interval/cardUi';
import { usePageMapOverlay, type MapPick } from '../../context/PageMapOverlay';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../../../shared/config';
import { PAGE_NAMES } from '../../../shared/pageNames';
import { capitalizeFirst } from '../../../shared/headwayText';
import { dateRange, shortDate } from '../../../shared/dateText';
import { dayInSentence, dayPlural } from '../../../shared/dayTypes';
import { joinList } from '../../../shared/overflowText';
import { TIME_OF_DAY_LABEL } from '../../../shared/liveWording';
import { studioBeforeAfterDevUrl, type StudioBeforeAfterFile } from '../../../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioVehiclesFile } from '../../../shared/studioVehicles';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT, vehiclesTitleText } from '../../../shared/studioWording';
import { StudioRouteTable, routeTitle } from './StudioRouteTable';
import { StudioGroupFigures } from './StudioGroupFigures';
import { CHANGE_COLOR, DEFAULT_PERIOD, changeGroups, groupFor, routeChangeAt, rowFigure, studioMapLines } from './fleetModel';
import StudioChips, { type StudioMenu } from './StudioChips';
import { useDevFile } from './useDevFile';

/**
 * Fleet (CIV-1828, a placeholder name), a page of Atlas Studio on the main map: how an agency's schedule changed between
 * two files (CIV-1715, CIV-1806) and, for an open route, the buses its group needs (CIV-1693, CIV-1827). The sidebar is
 * the main map's card (Panel sidebar), the map draws through the page overlay, the key sits in the map's key slot.
 * Local only (FEATURES.studio): both files come from scripts run on this Mac and are served by the Vite dev server.
 */

const T = STUDIO_MAP_TEXT;
const C = STUDIO_CHANGES_TEXT;

/** The list's columns: change dot, the route (number and name), then the older and newer dates' figures, each under its
 * date. The main map's card width: the number and name share one column so the name keeps room to read. */
const ROW_GRID = 'grid grid-cols-[0.5rem_minmax(0,1fr)_4.25rem_4.25rem] items-center gap-x-2';

/** The change list: every changed route by group; a click opens the route. Only the rows scroll. */
function ChangeList({ file, period, route, onPick }: { file: StudioBeforeAfterFile; period: PeriodKey; route: string | null; onPick: (r: string) => void }) {
  const groups = useMemo(() => changeGroups(file), [file]);
  return (
    <section aria-label={T.routes} className="flex min-h-0 flex-1 flex-col px-2 pb-2">
      {/* One column per compared date, each value under its date (CIV-1806); the time of day is the top bar's. */}
      <div className={`${ROW_GRID} shrink-0 px-2 pt-3 text-xs font-bold text-[var(--text-muted)]`}>
        <span className="col-span-2">{T.routes}</span>
        <span className="text-right">{dateRange(file.before.date, file.before.date)}</span>
        <span className="text-right">{dateRange(file.after.date, file.after.date)}</span>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {groups.map(g => (
          <div key={g.key} className="mt-2">
            {/* The heading stays in the route columns and wraps there; nothing crosses the date columns (Ryan, CIV-1806). */}
            <div className={`${ROW_GRID} px-2`}><h3 className="col-span-2 m-0 text-xs font-bold text-[var(--text-muted)]">{g.title}</h3></div>
            <ul className="m-0 p-0">
              {g.routes.map(c => {
                const l = routeTitle(c);
                const f = rowFigure(c, period);
                return (
                  <li key={c.route} className="list-none">
                    <button type="button" onClick={() => onPick(c.route)} aria-current={c.route === route ? 'true' : undefined}
                      className={`${ROW_GRID} w-full items-start rounded-xl px-2 py-0.5 text-left text-sm ${c.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                      <span aria-hidden className="mt-1.5 h-2 w-2 rounded-full" style={{ background: CHANGE_COLOR[routeChangeAt(file, c.route, period)] }} />
                      <span className="min-w-0">
                        <span className="font-bold">{l.primary}</span>{l.secondary && <span className="text-[var(--text-secondary)]"> {l.secondary}</span>}
                        {f.label && <span className="block text-xs text-[var(--text-muted)]">{f.label}</span>}
                      </span>
                      <span className="text-right">{f.before}</span>
                      {/* No bold on the newer figure (Ryan, CIV-1806: "Does bold mean better frequency?"). */}
                      <span className="text-right">{f.after}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {file.unchanged.length > 0 && (
          <div className={`${ROW_GRID} mt-2 px-2`}>
            <p className="col-span-2 m-0 text-sm text-[var(--text-secondary)]">{C.unchangedCount(file.unchanged.length)}</p>
          </div>
        )}
      </div>
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
      <p className="m-0 mb-1.5 text-xs font-bold text-[var(--text-muted)]">{T.keyTitle}</p>
      <MapKey stepsClassName="grid grid-cols-2 gap-x-2 gap-y-0.5" steps={steps} />
      <MapKey stepsClassName="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5" steps={sides} />
    </MapLegendCard>
  );
}

export interface FleetProps {
  slug: string;
  /** The agency's short name. */
  agency: string;
  route: string | null;
  setRoute: (r: string | null) => void;
  /** The agency menu, the shell's, first in the top bar. */
  agencyMenu: StudioMenu | null;
  headerPortal: Element | null;
  /** The sidebar card's place: sidebarFrameStyle(sidebarLeft, searchBarWidth), as History's panels. */
  frameStyle: React.CSSProperties;
}

export default function Fleet({ slug, agency, route, setRoute, agencyMenu, headerPortal, frameStyle }: FleetProps) {
  const file = useDevFile<StudioBeforeAfterFile>(studioBeforeAfterDevUrl(slug));
  const vehicles = useDevFile<StudioVehiclesFile>(studioVehiclesDevUrl(slug));
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const ready = file && file !== 'missing' ? file : null;
  // The times of day either file has figures for.
  const periods = PERIOD_KEYS.filter(k => (vehicles && vehicles !== 'missing' && vehicles.periods[k]?.length)
    || (ready && ready.changes.some(c => c.before?.headway[k] != null || c.after?.headway[k] != null)));
  const routeOptions = useMemo(() => (ready ? [['', T.allRoutes] as const, ...[...new Set([...Object.keys(ready.lines?.after ?? {}), ...Object.keys(ready.lines?.before ?? {})])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(r => { const l = routeTitle({ route: r, name: ready.changes.find(c => c.route === r)?.name ?? null }); return [r, <RouteRowName key={r} shortName={l.primary} name={l.secondary} />, l.text] as const; })] : []), [ready]);
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    ready ? { key: 'route', label: T.route, value: route ?? '', options: routeOptions, onPick: r => setRoute(r || null), active: route != null, panelClassName: 'w-64 max-h-[70vh] overflow-y-auto' } : null,
    periods.length ? { key: 'period', label: TIME_OF_DAY_LABEL, value: period, options: periods.map(k => [k, PERIOD_LABELS[k]] as const), onPick: k => setPeriod(k as PeriodKey), panelClassName: 'w-40' } : null,
  ];
  return (
    <>
      <StudioChips container={headerPortal} menus={menus} />
      {file === 'missing' && <Panel sidebar style={frameStyle}><PanelEmpty>{C.noData}</PanelEmpty></Panel>}
      {ready && <Body file={ready} vehicles={vehicles} agency={agency} period={period} route={route} setRoute={setRoute} frameStyle={frameStyle} />}
    </>
  );
}

function Body({ file, vehicles, agency, period, route, setRoute, frameStyle }: {
  file: StudioBeforeAfterFile; vehicles: StudioVehiclesFile | null | 'missing'; agency: string; period: PeriodKey; route: string | null; setRoute: (r: string | null) => void; frameStyle: React.CSSProperties;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const lines = useMemo(() => studioMapLines(file, period, route), [file, period, route]);
  // The map's pick in a ref: a new callback each render would redraw the overlay every time.
  const setRouteRef = useRef(setRoute);
  setRouteRef.current = setRoute;
  const onPick = useMemo(() => (p: MapPick | null) => { if (p?.kind === 'line' && p.route) setRouteRef.current(p.route); }, []);
  const { setOverlay } = usePageMapOverlay();
  // The agency is in the key: switching agencies frames the new network, not the last one's view.
  const frameKey = `${file.slug}:${route ? `route-${route}` : 'network'}`;
  useEffect(() => {
    setOverlay({ layer: { kind: 'lines', lines }, selected: null, onPick, highlightRoute: route, frameKey, frameCard: cardRef });
  }, [setOverlay, lines, onPick, route, frameKey]);
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
        <Panel sidebar enter ref={cardRef} className={SIDEBAR_CARD_ABOVE_KEY} style={frameStyle} aria-label={routeLabel.text}>
          <PanelBody className="px-4 pt-4 pb-2">
            <SidebarCardShell>
              <SidebarCardHeaderBlock>
                <SidebarCardHeader back={{ to: agency, onClick: () => setRoute(null) }} title={<RouteTitleName label={routeLabel} />} />
              </SidebarCardHeaderBlock>
              {change && (
                <SidebarCardSection label={PAGE_NAMES.studioChanges}>
                  <StudioRouteTable change={change} beforeDate={file.before.date} afterDate={file.after.date} period={period} />
                </SidebarCardSection>
              )}
              <SidebarCardSection label={vehiclesTitleText(dateRange(file.after.date, file.after.date)) || PAGE_NAMES.studioVehicles}>
                {vehicles === 'missing' ? <p className="m-0 text-sm text-[var(--text-muted)]">{C.noData}</p>
                  : vehicles ? <StudioGroupFigures group={groupFor(vehicles, route, period)} /> : null}
              </SidebarCardSection>
            </SidebarCardShell>
          </PanelBody>
        </Panel>
      ) : (
        <Panel sidebar enter ref={cardRef} className={SIDEBAR_CARD_ABOVE_KEY} style={frameStyle} aria-label={PAGE_NAMES.studioChanges}>
          <PanelTitleBar title={PAGE_NAMES.studioChanges} />
          <div className="shrink-0 px-4 pt-3">
            <p className="m-0 text-sm">{intro}</p>
            {leftOut.map(n => <p key={n} className="m-0 mt-1 text-sm text-[var(--text-muted)]">{n}</p>)}
          </div>
          <ChangeList file={file} period={period} route={route} onPick={setRoute} />
        </Panel>
      )}
      <FleetMapKey beforeDate={file.before.date} afterDate={file.after.date} />
    </>
  );
}
