import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AGENCY_COLUMN, ATLAS_BYLINE, MAP_COLOURS_LABEL } from './content/noticeCopy';
import { useSearchParams } from 'react-router';
import { useAgencies } from './hooks/useAgencies';
import { agencyNames } from './utils/agencyName';
import AtlasLogo from './components/AtlasLogo';
import RouteRowName from './components/RouteRowName';
import MapKey from './components/ui/MapKey';
import Card from './components/ui/Card';
import { CardBackLink } from './components/CardBack';
import { SubsectionTitle } from './components/ui/PageTitle';
import { RouteTitleName } from './components/RouteRowName';
import { SidebarCardSection } from './components/Interval/cardUi';
import { MapAppShell, MapAppHeader, MapAppLayout, MapAppMap, MapAppFooter, PillMenu, SidebarPanel, SidebarWidget, MAP_APP_PADDING, framePadding, useMapAppWide, type MapLine, type PanelWidget } from './components/MapApp';
import { MapLegendCard } from './components/ui/MapLegendCard';
import { frequencyChange } from '../shared/frequencyChange';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { PAGE_NAMES, tabTitle } from '../shared/pageNames';
import { capitalizeFirst } from '../shared/headwayText';
import { dateRange, shortDate } from '../shared/dateText';
import { dayInSentence, dayPlural } from '../shared/dayTypes';
import { joinList } from '../shared/overflowText';
import { TIME_OF_DAY_LABEL } from '../shared/liveWording';
import { RUN_STEP_MIN, SPAN_STEP_MIN, TRIP_STEP, changeSize, periodChange, routeFrequencyChange, studioBeforeAfterDevUrl, type StudioBeforeAfterFile, type StudioPeriodChange, type StudioRouteChange } from '../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioVehicleGroup, type StudioVehiclesFile } from '../shared/studioVehicles';
import { StudioRouteTable, periodFigure, routeFigureRows, routeTitle } from './StudioChangesPage';
import { StudioGroupFigures } from './StudioVehiclesPage';
import { STUDIO_DEFAULT_AGENCY, STUDIO_MANIFEST_DEV_URL, studioAgencyFrom } from '../shared/studioAgencies';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT, vehiclesTitleText } from '../shared/studioWording';

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
  // Each route's group by the shared rule as it stands now (changeSize), not the size its file was written with.
  const of = (size: StudioRouteChange['size']) => file.changes.filter(c => c.before && c.after && changeSize(c.before, c.after) === size);
  const added = file.changes.filter(c => !c.before), removed = file.changes.filter(c => !c.after);
  // CIV-1814 item 38: routes whose frequency changed grade lead, public-grade changes first, then those only inside the
  // hidden 5 and 8 grades, each by the biggest move in grades; then those where only the trip count moved; route order
  // breaks ties.
  const rank = (c: StudioRouteChange) => { const f = routeFrequencyChange(c.before, c.after); return f ? (f.publicChange ? 1000 : 0) + f.steps : -1; };
  const frequency = of('frequency').map(c => ({ c, r: rank(c) })).sort((x, y) => y.r - x.r).map(x => x.c);
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

/** How far a figure moved: a frequency in grades (frequencyChange; a start or stop outranks any), the others in their
 * own step (shared/studioBeforeAfter.ts changeSize's). 1 or more is a move that puts a route in its group. */
function movedSteps(c: StudioRouteChange, key: string): number {
  const b = c.before!, a = c.after!;
  const by = (x: number | null | undefined, y: number | null | undefined, step: number) => (x == null && y == null ? 0 : x == null || y == null ? Infinity : Math.abs(x - y) / step);
  if (key === 'trips') return by(b.trips, a.trips, TRIP_STEP);
  if (key === 'first' || key === 'last') return by(b[key], a[key], SPAN_STEP_MIN);
  if (key === 'run') return Math.max(by(b.runMinutes[0], a.runMinutes[0], RUN_STEP_MIN), by(b.runMinutes.at(-1), a.runMinutes.at(-1), RUN_STEP_MIN));
  return frequencyChange(b.headway[key as PeriodKey], a.headway[key as PeriodKey])?.steps ?? 0;
}

/**
 * The figure a list row shows (Ryan, CIV-1806: "the dates u are comparing are not by the actual numbers"): the time of
 * day's frequency where the route was added or removed, or where that frequency changed grade (frequencyChange); otherwise the
 * figure that moved most among its group's own kind (an hours row shows its first or last trip or trip time), named by
 * the route table's own label.
 */
export function rowFigure(c: StudioRouteChange, period: PeriodKey): RowFigure {
  const here = { before: periodFigure(c.before, period), after: periodFigure(c.after, period) };
  if (!c.before || !c.after) {
    // Added or removed: this time of day's figure, or where it has none, the first time of day the route ran.
    if (here.before !== here.after) return { label: null, ...here };
    const ran = routeFigureRows(c).find(r => (PERIOD_KEYS as readonly string[]).includes(r.key) && r.before !== r.after);
    return ran ? { label: ran.label, before: ran.before, after: ran.after } : { label: null, ...here };
  }
  if (movedSteps(c, period) >= 1) return { label: null, ...here };
  const keys = GROUP_KEYS[changeSize(c.before, c.after)];
  const changed = routeFigureRows(c).filter(r => r.before !== r.after && (!keys || keys.includes(r.key)));
  // A frequency that changed grade comes before trips (the group leads with frequency); otherwise the biggest move.
  const tier = (key: string) => ((PERIOD_KEYS as readonly string[]).includes(key) && movedSteps(c, key) >= 1 ? 1 : 0);
  const pick = changed.reduce<(typeof changed)[number] | null>((best, r) => (!best || tier(r.key) > tier(best.key) || (tier(r.key) === tier(best.key) && movedSteps(c, r.key) > movedSteps(c, best.key)) ? r : best), null);
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
      {/* Only the rows scroll; the header and the summary above stay put (Studio is a planner tool, not a Live sidebar). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map(g => (
          <div key={g.key} className="mt-2">
            {/* The heading stays in the route columns and wraps there; nothing crosses the date columns (Ryan, CIV-1806). */}
            <div className={`${ROW_GRID} px-2`}><h3 className="col-span-3 m-0 text-xs font-bold text-[var(--text-muted)]">{g.title}</h3></div>
            <ul className="m-0 p-0">
              {g.routes.map(c => {
                const l = routeTitle(c);
                const f = rowFigure(c, period);
                return (
                  <li key={c.route} className="list-none">
                    <button type="button" onClick={() => onPick(c.route)} aria-current={c.route === route ? 'true' : undefined}
                      className={`${ROW_GRID} w-full items-start rounded-xl px-2 py-0.5 text-left text-sm ${c.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                      <span aria-hidden className="mt-1.5 h-2 w-2 rounded-full" style={{ background: CHANGE_COLOR[routeChangeAt(file, c.route, period)] }} />
                      <span className="font-bold">{l.primary}</span>
                      <span className="min-w-0">
                        <span className="block text-[var(--text-secondary)]">{l.secondary}</span>
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
            <p className="col-span-3 m-0 text-sm text-[var(--text-secondary)]">{C.unchangedCount(file.unchanged.length)}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/** The map key in the regular map's key card and slot, bottom left above the footer (CIV-1821). */
function StudioMapKey({ beforeDate, afterDate }: { beforeDate: string; afterDate: string }) {
  const steps = (['more', 'less', 'same', 'none'] as const).map(k => ({ color: CHANGE_COLOR[k], label: T[k], className: 'text-xs text-[var(--text-primary)]' }));
  // CIV-1827: which line is which schedule, by its date (the change list's headers), in place of "Dashed: before the change".
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
  // CIV-1827: one card for the open route, as the main map's route card: the way back (CardBackLink, its slot above the
  // name), the route's name, what changed between the two dates, then what running it at other frequencies takes.
  const routeLabel = route ? routeTitle({ route, name: change?.name ?? null }) : null;
  // On a wide screen the card scrolls inside the sidebar when it is taller than the map (Studio is a planner tool, as its
  // change list); on narrow screens the page scrolls.
  const routeCard = route && routeLabel ? (
    <Card as="section" tone="surface" aria-label={routeLabel.text} className={`min-w-0 flex-1 p-3${wide ? ' min-h-0 overflow-y-auto' : ''}`}>
      <CardBackLink onClick={() => setRoute(null)}>{agency}</CardBackLink>
      <SubsectionTitle className="!m-0"><RouteTitleName label={routeLabel} /></SubsectionTitle>
      {change && (
        <SidebarCardSection label={PAGE_NAMES.studioChanges}>
          <StudioRouteTable change={change} beforeDate={file.before.date} afterDate={file.after.date} period={period} />
        </SidebarCardSection>
      )}
      <SidebarCardSection label={vehiclesTitleText(dateRange(file.after.date, file.after.date)) || PAGE_NAMES.studioVehicles}>
        {vehicles === 'missing' ? <p className="m-0 text-sm text-[var(--text-muted)]">{C.noData}</p>
          : vehicles ? <StudioGroupFigures group={groupFor(vehicles, route, period)} /> : null}
      </SidebarCardSection>
    </Card>
  ) : null;
  const routePanel: PanelWidget[] | null = routeCard ? [{ key: 'route', size: 'medium', node: routeCard }] : null;
  const list = <ChangeList file={file} period={period} route={route} onPick={setRoute} />;
  const routeOptions = useMemo(() => [['', T.allRoutes] as const, ...[...new Set([...Object.keys(file.lines?.after ?? {}), ...Object.keys(file.lines?.before ?? {})])]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(r => { const l = routeTitle({ route: r, name: file.changes.find(c => c.route === r)?.name ?? null }); return [r, <RouteRowName key={r} shortName={l.primary} name={l.secondary} />, l.text] as const; })], [file]);
  const routeMenu = routeSlot ? <PortalInto slot={routeSlot}><PillMenu label={T.route} alignRight active={route != null} value={route ?? ''} options={routeOptions} onPick={r => setRoute(r || null)} /></PortalInto> : null;
  return (
    <MapAppLayout
      wide={wide}
      portals={routeMenu}
      map={<MapAppMap
        layer={{ kind: 'lines', lines }} selected={null} highlightRoute={route}
        onPick={p => { if (p?.kind === 'line' && p.route) setRoute(p.route); }}
        // The agency is in the key: switching agencies must frame the new network, not keep the last one's view.
        frameKey={`${file.slug}:${route ? `route-${route}` : 'network'}-${footH}`}
        padding={framePadding(wide ? MAP_APP_PADDING.wide : MAP_APP_PADDING.narrow, footH)}
        ariaLabel={PAGE_NAMES.studio}
      />}
      overlay={<><StudioMapKey beforeDate={file.before.date} afterDate={file.after.date} /><MapAppFooter onHeight={setFootH} /></>}
      sidebar={routeCard ? <div className="flex min-h-0 flex-col">{routeCard}</div> : <><SidebarPanel className="shrink-0" widgets={summary} />{list}</>}
      narrowPanels={<>
        <SidebarPanel className="p-3" widgets={routePanel ?? summary} />
        {/* One column, one width: the list card is as wide as the summary card above it. */}
        {!routePanel && <div className="flex p-3 pt-0 [&>section]:flex-1">{list}</div>}
      </>}
    />
  );
}

function PortalInto({ slot, children }: { slot: HTMLElement; children: ReactNode }) { return createPortal(children, slot); }

export default function StudioPage() {
  // CIV-1806: the agency comes from the address (?agency=), picked in the header's menu.
  const [searchParams, setSearchParams] = useSearchParams();
  // The agencies with built files (shared/studioAgencies.ts), listed by the dev server; the address picks among them.
  const manifest = useDevFile<{ agencies: string[] }>(STUDIO_MANIFEST_DEV_URL);
  const studioAgencies = manifest && manifest !== 'missing' ? manifest.agencies : manifest === 'missing' ? [] : null;
  const slug = studioAgencyFrom(searchParams.get('agency'), studioAgencies);
  const agency = useLiveAgencyName(slug);
  const { agencies } = useAgencies();
  const agencyOptions = useMemo(() => (studioAgencies ?? [slug]).map(s => {
    const a = agencies.find(x => x.slug === s);
    return [s, a ? agencyNames(a).name : s] as const;
  }), [agencies, studioAgencies, slug]);
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
        <PillMenu label={AGENCY_COLUMN} active={slug !== STUDIO_DEFAULT_AGENCY} value={slug} options={agencyOptions} onPick={pickAgency} />
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
