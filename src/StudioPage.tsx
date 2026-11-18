import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AGENCY_COLUMN, ATLAS_BYLINE, MAP_COLOURS_LABEL } from './content/noticeCopy';
import { useSearchParams } from 'react-router';
import { useAgencies } from './hooks/useAgencies';
import { agencyNames } from './utils/agencyName';
import AtlasLogo from './components/AtlasLogo';
import RouteRowName from './components/RouteRowName';
import MapKey from './components/ui/MapKey';
import LiveBackLink from './components/Live/LiveBackLink';
import { MapAppShell, MapAppHeader, MapAppLayout, MapAppMap, MapAppFooter, PillMenu, SidebarPanel, SidebarWidget, MAP_APP_PADDING, framePadding, useMapAppWide, type MapLine, type PanelWidget } from './components/MapApp';
import { MapLegendCard } from './components/ui/MapLegendCard';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { PAGE_NAMES, tabTitle } from '../shared/pageNames';
import { headwayAmount, capitalizeFirst } from '../shared/headwayText';
import { dateRange, shortDate } from '../shared/dateText';
import { dayInSentence, dayPlural } from '../shared/dayTypes';
import { joinList } from '../shared/overflowText';
import { MISSING_VALUE } from '../shared/missingValue';
import { TIME_OF_DAY_LABEL } from '../shared/liveWording';
import { FREQUENCY_STEP_MIN, RUN_STEP_MIN, SPAN_STEP_MIN, TRIP_STEP, frequencyMoved, periodChange, studioBeforeAfterDevUrl, type StudioBeforeAfterFile, type StudioPeriodChange, type StudioRouteChange } from '../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioBranchSplit, type StudioVehicleGroup, type StudioVehiclesFile } from '../shared/studioVehicles';
import { StudioRouteTable, routeFigureRows, routeTitle } from './StudioChangesPage';
import { STUDIO_AGENCIES, StudioGroupFigures, studioAgencyFrom } from './StudioVehiclesPage';
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

/** What a list row shows (CIV-1806): one figure, older and newer, and its name when it isn't the time of day's frequency. */
export interface RowFigure { label: string | null; before: string; after: string }

/** The figures each group's rows choose from: a frequency or trips change, its frequencies and trips; a first or last
 * trip or trip time change, those; a small change, any. */
const GROUP_KEYS: Record<StudioRouteChange['size'], ReadonlyArray<string> | null> = {
  frequency: [...PERIOD_KEYS, 'trips'],
  hours: ['first', 'last', 'run'],
  small: null,
};

/** How far a figure moved, in its own step (shared/studioBeforeAfter.ts changeSize's): 1 or more is the move that puts a
 * route in its group; a frequency that starts or stops counts as any. */
function movedSteps(c: StudioRouteChange, key: string): number {
  const b = c.before!, a = c.after!;
  const by = (x: number | null | undefined, y: number | null | undefined, step: number) => (x == null && y == null ? 0 : x == null || y == null ? Infinity : Math.abs(x - y) / step);
  if (key === 'trips') return by(b.trips, a.trips, TRIP_STEP);
  if (key === 'first' || key === 'last') return by(b[key], a[key], SPAN_STEP_MIN);
  if (key === 'run') return Math.max(by(b.runMinutes[0], a.runMinutes[0], RUN_STEP_MIN), by(b.runMinutes.at(-1), a.runMinutes.at(-1), RUN_STEP_MIN));
  return by(b.headway[key as PeriodKey], a.headway[key as PeriodKey], FREQUENCY_STEP_MIN);
}

/**
 * The figure a list row shows (Ryan, CIV-1806: "the dates u are comparing are not by the actual numbers"): the time of
 * day's frequency where the route was added or removed, or where that frequency moved enough to count; otherwise the
 * figure that moved most among its group's own kind (an hours row shows its first or last trip or trip time), named by
 * the route table's own label. CIV-1814 item 38's shared grade rule replaces the frequency steps when it lands.
 */
export function rowFigure(c: StudioRouteChange, period: PeriodKey): RowFigure {
  const here = { before: c.before ? headwayAmount(c.before.headway[period]) : MISSING_VALUE, after: c.after ? headwayAmount(c.after.headway[period]) : MISSING_VALUE };
  if (!c.before || !c.after || (here.before !== here.after && movedSteps(c, period) >= 1)) return { label: null, ...here };
  const keys = GROUP_KEYS[c.size];
  const changed = routeFigureRows(c).filter(r => r.before !== r.after && (!keys || keys.includes(r.key)));
  const pick = changed.reduce<(typeof changed)[number] | null>((best, r) => (!best || movedSteps(c, r.key) > movedSteps(c, best.key) ? r : best), null);
  return pick ? { label: pick.key === period ? null : pick.label, before: pick.before, after: pick.after } : { label: null, ...here };
}

/** The list's columns: change dot, route, name, then the older and newer dates' figures, each under its date. */
const ROW_GRID = 'grid grid-cols-[0.5rem_2.75rem_minmax(0,1fr)_4.75rem_4.75rem] items-center gap-x-2';

/** The change list: every changed route by group, Live's route list rows (OverviewList); a click picks the route. */
function ChangeList({ file, period, route, onPick }: { file: StudioBeforeAfterFile; period: PeriodKey; route: string | null; onPick: (r: string) => void }) {
  const groups = useMemo(() => changeGroups(file), [file]);
  return (
    <section aria-label={T.routes} className="flex min-h-0 flex-initial flex-col overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-header)]/90 p-3 backdrop-blur">
      {/* One column per compared date, each value under its date (CIV-1806); the time of day is the top bar's. */}
      <div className={`${ROW_GRID} shrink-0 px-2 text-xs font-bold text-[var(--text-muted)]`}>
        <span className="col-span-3">{T.routes}</span>
        <span className="text-right">{dateRange(file.before.date, file.before.date)}</span>
        <span className="text-right">{dateRange(file.after.date, file.after.date)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {groups.map(g => (
          <div key={g.key} className="mt-2">
            <h3 className="m-0 px-2 text-xs font-bold text-[var(--text-muted)]">{g.title}</h3>
            <ul className="m-0 p-0">
              {g.routes.map(c => {
                const l = routeTitle(c);
                const f = rowFigure(c, period);
                return (
                  <li key={c.route} className="list-none">
                    <button type="button" onClick={() => onPick(c.route)} aria-current={c.route === route ? 'true' : undefined}
                      className={`${ROW_GRID} w-full rounded-xl px-2 py-0.5 text-left text-sm ${c.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: CHANGE_COLOR[routeChangeAt(file, c.route, period)] }} />
                      <span className="font-bold">{l.primary}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[var(--text-secondary)]">{l.secondary}</span>
                        {f.label && <span className="block truncate text-xs text-[var(--text-muted)]">{f.label}</span>}
                      </span>
                      <span className="whitespace-nowrap text-right">{f.before}</span>
                      <span className={`whitespace-nowrap text-right ${f.before !== f.after ? 'font-bold' : ''}`}>{f.after}</span>
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

/** The map key in the regular map's key card and slot, bottom left above the footer (CIV-1821). */
function StudioMapKey() {
  const steps = (['more', 'less', 'same', 'none'] as const).map(k => ({ color: CHANGE_COLOR[k], label: T[k], className: 'text-xs text-[var(--text-primary)]' }));
  return (
    <MapLegendCard label={MAP_COLOURS_LABEL}>
      <p className="m-0 mb-1.5 text-xs font-bold text-[var(--text-muted)]">{T.keyTitle}<span className="font-normal"> · {T.dashed}</span></p>
      <MapKey stepsClassName="grid grid-cols-2 gap-x-2 gap-y-0.5" steps={steps} />
    </MapLegendCard>
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
        padding={framePadding(wide ? MAP_APP_PADDING.wide : MAP_APP_PADDING.narrow, footH)}
        ariaLabel={PAGE_NAMES.studio}
      />}
      overlay={<><StudioMapKey /><MapAppFooter onHeight={setFootH} /></>}
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
  // CIV-1806: the agency comes from the address (?agency=), picked in the header's menu.
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = studioAgencyFrom(searchParams.get('agency'));
  const agency = useLiveAgencyName(slug);
  const { agencies } = useAgencies();
  const agencyOptions = useMemo(() => STUDIO_AGENCIES.map(s => {
    const a = agencies.find(x => x.slug === s);
    return [s, a ? agencyNames(a).name : s] as const;
  }), [agencies]);
  const pickAgency = (s: string) => { setRoute(null); setSearchParams(p => { const n = new URLSearchParams(p); n.set('agency', s); return n; }); };
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
        <PillMenu label={AGENCY_COLUMN} value={slug} options={agencyOptions} onPick={pickAgency} />
        <div className="ml-auto flex items-center gap-3">
          <div ref={setRouteSlot} className="contents" />
          {periods.length > 0 && <PillMenu label={TIME_OF_DAY_LABEL} value={period} options={periods.map(k => [k, PERIOD_LABELS[k]] as const)} onPick={k => setPeriod(k as PeriodKey)} />}
        </div>
      </MapAppHeader>
      {file === 'missing' && <p className="p-6 text-sm text-[var(--text-muted)]">{C.noData}</p>}
      {file && file !== 'missing' && <Body key={slug} file={file} vehicles={vehicles} agency={agency} period={period} route={route} setRoute={setRoute} routeSlot={routeSlot} />}
    </MapAppShell>
  );
}
