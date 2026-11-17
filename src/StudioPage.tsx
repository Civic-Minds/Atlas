import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ATLAS_BYLINE, MAP_COLOURS_LABEL } from './content/noticeCopy';
import AtlasLogo from './components/AtlasLogo';
import RouteRowName from './components/RouteRowName';
import MapKey from './components/ui/MapKey';
import LiveBackLink from './components/Live/LiveBackLink';
import { MapAppShell, MapAppHeader, MapAppLayout, MapAppMap, MapAppFooter, PillMenu, SidebarPanel, SidebarWidget, MAP_APP_PADDING, framePadding, useMapAppWide, type MapLine, type PanelWidget } from './components/MapApp';
import { MAP_BADGE, MAP_BADGE_LABEL } from './styles';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { PAGE_NAMES, tabTitle } from '../shared/pageNames';
import { headwayAmount, capitalizeFirst } from '../shared/headwayText';
import { shortDate } from '../shared/dateText';
import { dayInSentence, dayPlural } from '../shared/dayTypes';
import { joinList } from '../shared/overflowText';
import { MISSING_VALUE } from '../shared/missingValue';
import { TIME_OF_DAY_LABEL } from '../shared/liveWording';
import { frequencyMoved, periodChange, studioBeforeAfterDevUrl, type StudioBeforeAfterFile, type StudioPeriodChange, type StudioRouteChange } from '../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioBranchSplit, type StudioVehicleGroup, type StudioVehiclesFile } from '../shared/studioVehicles';
import { StudioRouteTable, routeTitle } from './StudioChangesPage';
import { STUDIO_DEFAULT_AGENCY, StudioGroupFigures } from './StudioVehiclesPage';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT } from '../shared/studioWording';

/**
 * Atlas Studio (CIV-1731): one map-and-sidebar page on the shared layout Live uses (CIV-1732), desktop only. The map draws
 * every route of the newer schedule, coloured by how its frequency changed at the top bar's time of day; the sidebar
 * lists the changes (CIV-1715) and, for a picked route, its before/after figures and the buses its group needs (CIV-1693).
 * Local only (FEATURES.studio): both files come from scripts run on this Mac and are served by the Vite dev server.
 * Its words are in shared/studioWording.ts.
 */

const T = STUDIO_MAP_TEXT;
const C = STUDIO_CHANGES_TEXT;

const DEFAULT_PERIOD: PeriodKey = 'midday';

/** The colours, from the History page's frequency-change line (better, worse, no change) and the map's faded route. */
export const CHANGE_COLOR: Record<StudioPeriodChange, string> = {
  more: 'var(--status-positive)',
  less: 'var(--status-negative)',
  same: 'var(--status-neutral)',
  none: 'var(--dim-route)',
};

export interface ChangeGroup { key: string; title: string; routes: StudioRouteChange[] }

/** The sidebar's groups, in the order the page had them: frequency or trips, first or last trip, added, removed, small. */
export function changeGroups(file: StudioBeforeAfterFile): ChangeGroup[] {
  const of = (size: StudioRouteChange['size']) => file.changes.filter(c => c.size === size && c.before && c.after);
  const added = file.changes.filter(c => !c.before), removed = file.changes.filter(c => !c.after);
  // Routes whose frequency moved lead, then those where only the trip count did; route order inside each.
  const frequency = [...of('frequency').filter(c => frequencyMoved(c.before, c.after)), ...of('frequency').filter(c => !frequencyMoved(c.before, c.after))];
  return [
    { key: 'frequency', title: C.frequencyTitle, routes: frequency },
    { key: 'hours', title: C.hoursTitle, routes: of('hours') },
    { key: 'added', title: C.addedTitle(added.length), routes: added },
    { key: 'removed', title: C.removedTitle(removed.length), routes: removed },
    { key: 'small', title: C.smallTitle, routes: of('small') },
  ].filter(g => g.routes.length > 0);
}

/** A route's change at one time of day, for its colour; an unchanged route reads "same". */
export function routeChangeAt(file: StudioBeforeAfterFile, route: string, period: PeriodKey): StudioPeriodChange {
  const c = file.changes.find(x => x.route === route);
  if (!c) return 'same';
  if (!c.before) return 'more';
  if (!c.after) return 'less';
  return periodChange(c.before, c.after, period);
}

/** The map's lines: each route's newer shape (a removed route's older one, dashed) in its change colour; the picked route's older shape dashed under it. */
export function studioMapLines(file: StudioBeforeAfterFile, period: PeriodKey, picked: string | null): MapLine[] {
  const before = file.lines?.before ?? {}, after = file.lines?.after ?? {};
  const names = [...new Set([...Object.keys(after), ...Object.keys(before)])];
  const out: MapLine[] = [];
  for (const route of names) {
    const color = CHANGE_COLOR[routeChangeAt(file, route, period)];
    const label = routeTitle({ route, name: file.changes.find(c => c.route === route)?.name ?? null }).text;
    const removed = !after[route];
    if (route === picked && !removed && before[route]) {
      before[route].forEach((coordinates, i) => out.push({ id: `${route}:before:${i}`, route, label, coordinates, color: CHANGE_COLOR.same, dashed: true, width: 4 }));
    }
    (removed ? before[route] : after[route]).forEach((coordinates, i) => out.push({ id: `${route}:${removed ? 'before' : 'after'}:${i}`, route, label, coordinates, color, dashed: removed }));
  }
  return out;
}

/** The figure a list row shows for the time of day: older → newer where it changed, else the one value. */
export function rowFigure(c: StudioRouteChange, period: PeriodKey): string {
  const b = c.before ? headwayAmount(c.before.headway[period]) : MISSING_VALUE;
  const a = c.after ? headwayAmount(c.after.headway[period]) : MISSING_VALUE;
  return b === a ? a : `${b} → ${a}`;
}

/** The change list: every changed route by group, Live's route list rows (OverviewList); a click picks the route. */
function ChangeList({ file, period, route, onPick }: { file: StudioBeforeAfterFile; period: PeriodKey; route: string | null; onPick: (r: string) => void }) {
  const groups = useMemo(() => changeGroups(file), [file]);
  return (
    <section aria-label={T.routes} className="flex min-h-0 flex-initial flex-col overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-header)]/90 p-3 backdrop-blur">
      <div className="flex shrink-0 items-baseline justify-between text-xs font-bold text-[var(--text-muted)]">
        <span>{T.routes}</span>
        <span>{PERIOD_LABELS[period]}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {groups.map(g => (
          <div key={g.key} className="mt-2">
            <h3 className="m-0 px-2 text-xs font-bold text-[var(--text-muted)]">{g.title}</h3>
            <ul className="m-0 p-0">
              {g.routes.map(c => {
                const l = routeTitle(c);
                return (
                  <li key={c.route} className="list-none">
                    <button type="button" onClick={() => onPick(c.route)} aria-current={c.route === route ? 'true' : undefined}
                      className={`grid w-full grid-cols-[0.5rem_2.75rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-xl px-2 py-0.5 text-left text-sm ${c.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANGE_COLOR[routeChangeAt(file, c.route, period)] }} />
                      <span className="font-bold">{l.primary}</span>
                      <span className="truncate text-[var(--text-secondary)]">{l.secondary}</span>
                      <span className="whitespace-nowrap">{rowFigure(c, period)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {file.unchanged.length > 0 && (
          <div className="mt-2 px-2">
            <h3 className="m-0 text-xs font-bold text-[var(--text-muted)]">{C.unchangedTitle}</h3>
            <p className="m-0 text-sm text-[var(--text-secondary)]">{file.unchanged.join(', ')}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** The map key: one pill at the map's top left, as Live's. */
function StudioMapKey() {
  const steps = (['more', 'less', 'same', 'none'] as const).map(k => ({ color: CHANGE_COLOR[k], label: <span className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>{T[k]}</span> }));
  return (
    <div className={`${MAP_BADGE} min-h-8 max-w-full flex-wrap gap-x-3 gap-y-1.5 py-1.5`} role="group" aria-label={MAP_COLOURS_LABEL}>
      <span className="whitespace-nowrap text-xs font-bold leading-none text-[var(--text-secondary)]">{T.keyTitle}<span className="font-normal text-[var(--text-muted)]"> · {T.dashed}</span></span>
      <MapKey steps={steps} />
    </div>
  );
}

function useDevFile<F>(url: string): F | null | 'missing' {
  const [file, setFile] = useState<F | null | 'missing'>(null);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<F | 'missing'> => {
      try {
        const r = await fetch(url);
        return r.ok ? await r.json() as F : 'missing';
      } catch { return 'missing'; }
    };
    void load().then(f => { if (live) setFile(f); });
    return () => { live = false; };
  }, [url]);
  return file;
}

/** The group of routes that share buses with this route, at the time of day. */
export function groupFor(vehicles: StudioVehiclesFile, route: string, period: PeriodKey): StudioVehicleGroup | null {
  return vehicles.periods[period]?.find(g => g.routes.includes(route)) ?? null;
}

function Body({ file, vehicles, agency, period, route, setRoute, routeSlot }: {
  file: StudioBeforeAfterFile; vehicles: StudioVehiclesFile | null | 'missing'; agency: string; period: PeriodKey; route: string | null; setRoute: (r: string | null) => void; routeSlot: HTMLElement | null;
}) {
  const wide = useMapAppWide();
  const [footH, setFootH] = useState(0);
  // CIV-1712: the planner's branch split, the current mix until changed.
  const [split, setSplit] = useState<StudioBranchSplit>('current');
  const lines = useMemo(() => studioMapLines(file, period, route), [file, period, route]);
  const change = route ? file.changes.find(c => c.route === route) ?? null : null;
  const intro = file.day ? C.intro(agency, dayInSentence(file.day), shortDate(file.before.date) ?? file.before.date, shortDate(file.after.date) ?? file.after.date) : C.noDay;
  const leftOut = (['after', 'before'] as const).map(side => {
    const days = file.leftOut.filter(l => l.sides.includes(side)).map(l => capitalizeFirst(dayPlural(l.day)));
    return days.length ? C.leftOut(joinList(days), side === 'after') : null;
  }).filter((n): n is string => !!n);
  const summary: PanelWidget[] = [{ key: 'intro', size: 'medium', node: (
    <SidebarWidget title={PAGE_NAMES.studioChanges}>
      <p className="m-0 text-sm">{intro}</p>
      {leftOut.map(n => <p key={n} className="m-0 mt-1 text-sm text-[var(--text-muted)]">{n}</p>)}
    </SidebarWidget>
  ) }];
  const back: PanelWidget = { key: 'back', size: 'medium', node: <LiveBackLink agencyName={agency} onClick={() => setRoute(null)} className="-my-[13px] py-[13px] pr-4" /> };
  const routePanel: PanelWidget[] | null = route ? [
    back,
    ...(change ? [{ key: 'changes', size: 'medium' as const, node: <SidebarWidget title={PAGE_NAMES.studioChanges}><StudioRouteTable change={change} /></SidebarWidget> }] : []),
    { key: 'vehicles', size: 'medium', node: (
      <SidebarWidget title={PAGE_NAMES.studioVehicles}>
        {vehicles === 'missing' ? <p className="m-0 text-sm text-[var(--text-muted)]">{C.noData}</p>
          : vehicles ? <StudioGroupFigures group={groupFor(vehicles, route, period)} periodLabel={PERIOD_LABELS[period]} split={split} onSplit={setSplit} /> : null}
      </SidebarWidget>
    ) },
  ] : null;
  const list = <ChangeList file={file} period={period} route={route} onPick={setRoute} />;
  const routeOptions = useMemo(() => [['', T.allRoutes] as const, ...[...new Set([...Object.keys(file.lines?.after ?? {}), ...Object.keys(file.lines?.before ?? {})])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(r => { const l = routeTitle({ route: r, name: file.changes.find(c => c.route === r)?.name ?? null }); return [r, <RouteRowName key={r} shortName={l.primary} name={l.secondary} />, l.text] as const; })], [file]);
  const routeMenu = routeSlot ? <PortalInto slot={routeSlot}><PillMenu label={T.route} alignRight value={route ?? ''} options={routeOptions} onPick={r => setRoute(r || null)} /></PortalInto> : null;
  return (
    <MapAppLayout
      wide={wide}
      portals={routeMenu}
      map={<MapAppMap
        layer={{ kind: 'lines', lines }} selected={null} highlightRoute={route}
        onPick={p => { if (p?.kind === 'line' && p.route) setRoute(p.route); }}
        frameKey={route ? `route-${route}-${footH}` : `network-${footH}`}
        padding={framePadding(wide ? MAP_APP_PADDING.wide : MAP_APP_PADDING.narrow, footH)} controlsRight={12}
        ariaLabel={PAGE_NAMES.studio}
      />}
      overlay={<><div className="pointer-events-auto absolute left-0 top-0 max-w-full"><StudioMapKey /></div><MapAppFooter onHeight={setFootH} /></>}
      sidebar={routePanel ? <SidebarPanel widgets={routePanel} /> : <><SidebarPanel widgets={summary} />{list}</>}
      narrowPanels={<>
        <SidebarPanel className="p-3" widgets={routePanel ?? summary} />
        {!routePanel && <div className="flex p-3 pt-0">{list}</div>}
      </>}
    />
  );
}

function PortalInto({ slot, children }: { slot: HTMLElement; children: ReactNode }) { return createPortal(children, slot); }

export default function StudioPage() {
  // One demo agency for now (Kingston); a picker waits until Studio has more than one.
  const slug = STUDIO_DEFAULT_AGENCY;
  const agency = useLiveAgencyName(slug);
  const file = useDevFile<StudioBeforeAfterFile>(studioBeforeAfterDevUrl(slug));
  const vehicles = useDevFile<StudioVehiclesFile>(studioVehiclesDevUrl(slug));
  const [route, setRoute] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [routeSlot, setRouteSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { document.title = tabTitle(PAGE_NAMES.studio, agency); }, [agency]);
  // The times of day either file has figures for.
  const periods = PERIOD_KEYS.filter(k => (vehicles && vehicles !== 'missing' && vehicles.periods[k]?.length)
    || (file && file !== 'missing' && file.changes.some(c => c.before?.headway[k] != null || c.after?.headway[k] != null)));
  return (
    <MapAppShell>
      <MapAppHeader>
        <AtlasLogo href="/" ariaLabel={ATLAS_BYLINE} showMark={false} />
        <button type="button" onClick={() => setRoute(null)} className="text-sm font-bold hover:underline">{agency}</button>
        <div className="ml-auto flex items-center gap-3">
          <div ref={setRouteSlot} className="contents" />
          {periods.length > 0 && <PillMenu label={TIME_OF_DAY_LABEL} value={period} options={periods.map(k => [k, PERIOD_LABELS[k]] as const)} onPick={k => setPeriod(k as PeriodKey)} />}
        </div>
      </MapAppHeader>
      {file === 'missing' && <p className="p-6 text-sm text-[var(--text-muted)]">{C.noData}</p>}
      {file && file !== 'missing' && <Body file={file} vehicles={vehicles} agency={agency} period={period} route={route} setRoute={setRoute} routeSlot={routeSlot} />}
    </MapAppShell>
  );
}
