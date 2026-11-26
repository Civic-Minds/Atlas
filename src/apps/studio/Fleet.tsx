import { useEffect, useMemo, useRef, useState } from 'react';
import { MAP_COLOURS_LABEL, TIME_LABEL } from '../../content/noticeCopy';
import { vehiclesWord } from '../../../shared/modeVehicles';
import { RouteTitleName } from '../../components/RouteRowName';
import MapKey from '../../components/ui/MapKey';
import { dashedLineSwatch } from '../../styles';
import { PanelBody, PanelTitleBar } from '../../components/ui/Panel';
import { StudioRouteSearch, useStudioSearchOpen } from './StudioSearch';
import StudioPanel from '../../components/ui/WidePanel';
import PanelEmpty from '../../components/ui/PanelEmpty';
import ViewLoadingPanel, { CardLoadingLine } from '../../components/ViewLoadingPanel';
import { MapLegendCard } from '../../components/ui/MapLegendCard';
import { CardBodyText, CardSectionLabel, SidebarCardHeader, SidebarCardHeaderBlock, SidebarCardSection, SidebarCardShell } from '../../components/Interval/cardUi';
import { RouteListColumns, RouteListHeader } from '../../components/RouteListRow';
import CardRouteList from '../../components/Interval/CardRouteList';
import AgencyGroupHeader from '../../components/ui/AgencyGroupHeader';
import { usePageMapOverlay, type MapPick } from '../../context/PageMapOverlay';
import { useStudioMapFrame } from '../../context/StudioMapFrame';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../../../shared/config';
import { periodMenuOptions } from '../../components/Interval/pickers';
import { PAGE_NAMES } from '../../../shared/pageNames';
import { capitalizeFirst } from '../../../shared/headwayText';
import { dateRange, shortDate } from '../../../shared/dateText';
import { dayInSentence, dayPlural } from '../../../shared/dayTypes';
import { joinList } from '../../../shared/overflowText';
import { pairedStudioFile, periodChange, studioBeforeAfterDevUrl, type StudioBeforeAfterFile, type StudioRouteChange } from '../../../shared/studioBeforeAfter';
import { studioVehiclesDevUrl, type StudioVehiclesFile } from '../../../shared/studioVehicles';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT, STUDIO_REDESIGN_TEXT, fleetNetworkText, vehiclesNeededTitle, vehiclesTitleText } from '../../../shared/studioWording';
import Widget from '../../components/Live/tool/Widget';
import { PanelSection, PanelSectionsProvider } from '../../components/Live/panelSections';
import { CARD_NOTE } from '../../styles';
import SplitBar from '../../components/charts/SplitBar';
import DataTable from '../../components/ui/DataTable';
import { countText } from '../../../shared/numberText';
import { useAgencies } from '../../hooks/useAgencies';
import { getNowPeriodForTimezone } from '../../components/Interval/FilterChips';
import { HeadwaySparkline } from '../../components/Interval/HeadwaySparkline';
import { HOUR_TO_PERIOD, periodValuesByHour } from '../../utils/sparklinePeriods';
import { hourChartMaxFreq } from '../../utils/hourChartModel';
import { SPARKLINE_HOURS } from '../../../shared/config';
import type { HeadwayByHour } from '../../../shared/routeProperties';
import { StudioRouteTable, pairFigures, periodCell, routeTitle } from './StudioRouteTable';
import { StudioGroupFigures } from './StudioGroupFigures';
import { CHANGE_COLOR, DEFAULT_PERIOD, type ChangeGroup, agencyFleet, agencyRouteCount, changeGroups, modesFor, groupFor, rowChange, rowFigure, studioMapLines } from './fleetModel';
import StudioChips, { type StudioMenu } from './StudioChips';
import { useDevFile } from './useDevFile';
import { schedulesDesign, type SchedulesDesign } from './reviewDesign';
import { agencyNow } from '../../../scripts/mcp/nowClock';
import { useInServiceNow } from './useInServiceNow';
import { useNetworkInService, type NetworkCount } from './useNetworkInService';

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
function ChangeList({ file, period, onPick, design = 'today' }: { file: StudioBeforeAfterFile; period: PeriodKey; onPick: (r: string) => void; design?: SchedulesDesign }) {
  if (design === 'summary') return <SummaryChanges file={file} period={period} onPick={onPick} />;
  return <GroupedChangeList file={file} period={period} onPick={onPick} design={design} />;
}

/**
 * CIV-2182 "summary" design, the route card: the route card's frequency chart (HeadwaySparkline) for each schedule, one
 * above the other on one scale, the top bar's time of day lit. Mock-up: each hour takes its time of day's figure (the files
 * carry one figure per time of day); a built version would carry each hour's.
 */
function ScheduleSparklines({ change, period, beforeDate, afterDate }: { change: StudioRouteChange; period: PeriodKey; beforeDate: string; afterDate: string }) {
  const byHour = (d: StudioRouteChange['before']): HeadwayByHour => periodValuesByHour(d?.headway ?? {});
  const sides = [{ date: beforeDate, hours: byHour(change.before) }, { date: afterDate, hours: byHour(change.after) }];
  const scaleMaxFreq = hourChartMaxFreq(sides.map(x => x.hours), SPARKLINE_HOURS) || undefined;
  return (
    <>
      {sides.map(x => <div key={x.date} className="mt-3"><CardSectionLabel className="!mb-0">{dateRange(x.date, x.date)}</CardSectionLabel><HeadwaySparkline byHour={x.hours} period={period} title={dateRange(x.date, x.date)} scaleMaxFreq={scaleMaxFreq} /></div>)}
    </>
  );
}

/**
 * CIV-2182 "now" design, Fleet's agency card: Live's vehicles on the road now, the vehicles the schedule needs now, and the
 * vehicles it needs at the top bar's time of day, in the shared table. A dash where Live doesn't follow the agency.
 */
export function FleetNowTable({ modes, runningNow, scheduledNow }: { modes: readonly number[] | undefined; runningNow: NetworkCount | null; scheduledNow: number | null }) {
  const N = fleetNetworkText(modes);
  const R = STUDIO_REDESIGN_TEXT;
  // A row with no figure is left out, never a dash (CIV-2182: no placeholder reaches Ryan).
  const rows = [
    { key: 'live', label: N.inServiceNow, n: runningNow?.onTrip ?? null },
    // CIV-2939 (Ryan, 2026-11-25: "1"): vehicles reporting a position with no trip, a quieter row straight under "In service
    // now", only where the feed reports any (never 0) and never added into a total.
    { key: 'noTrip', label: N.notOnTrip, n: runningNow?.noTrip ?? null },
    { key: 'now', label: R.scheduledNow, n: scheduledNow },
  ].flatMap(r => (r.n == null ? [] : [{ key: r.key, label: r.label, value: countText(r.n) }]));
  if (!rows.length) return null;
  return (
    <DataTable caption={PAGE_NAMES.studioVehicles} layout="fill" rows={rows} rowKey={r => r.key} rowMuted={r => r.key === 'noTrip'} columns={[
      { key: 'label', header: TIME_LABEL, rowHeader: true, width: 9, className: 'font-normal', cell: r => r.label },
      { key: 'value', header: <span className="block text-right">{N.count}</span>, className: 'text-right', cell: r => r.value },
    ]} />
  );
}

/**
 * CIV-2182 "now" design (Ryan: a sparkline of the vehicles the schedule needs in each period, like the frequency
 * sparkline): the route card's frequency chart, each hour's bar the whole agency's vehicles for its time of day, the top
 * bar's time of day lit. Bar heights scale with the count (the chart's height is trips per hour, so 60 / count).
 */
function FleetPeriodSparkline({ vehicles, period, setPeriod, modes }: { vehicles: StudioVehiclesFile; period: PeriodKey; setPeriod: (p: PeriodKey) => void; modes: readonly number[] | undefined }) {
  const word = vehiclesWord(modes);
  // The vehicles the schedule runs (as the MCP's scheduledNow), not those its own frequencies would need (implied).
  const counts = Object.fromEntries(PERIOD_KEYS.map(p => [p, agencyFleet(vehicles, p)?.scheduled ?? null])) as Record<PeriodKey, number | null>;
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const countByHour = periodValuesByHour(counts);
  const byHour: Record<number, number | null> = {};
  const stackedByHour: Record<number, { label: string; headway: number; color: string }[]> = {};
  for (const h of SPARKLINE_HOURS) {
    const n = countByHour[h];
    byHour[h] = n ? 60 / n : null;
    if (n) stackedByHour[h] = [{ label: word, headway: 60 / n, color: CHANGE_COLOR.same }];
  }
  const periodLine = (p: PeriodKey) => (counts[p] == null ? undefined : `${PERIOD_LABELS[p]}: ${countText(counts[p]!)} ${word}`);
  const hourTitle = (h: number) => periodLine(HOUR_TO_PERIOD[h] as PeriodKey);
  return (
    <PanelSection label={STUDIO_REDESIGN_TEXT.scheduledByPeriod}>
      {/* Ryan: "Sparkline doesnt have the hover function tho": the route card's hover (onPeriodChange makes it interactive), the
          hovered time of day's count read out under it, and a click picks that time of day in the top bar. */}
      <HeadwaySparkline byHour={byHour} stackedByHour={stackedByHour} legendStackedByHour={{}} period={period} title={STUDIO_REDESIGN_TEXT.scheduledByPeriod} hourTitle={hourTitle} onPeriodChange={p => setPeriod(p as PeriodKey)} onHourHover={setHoverHour} />
      <p className={`m-0 ${CARD_NOTE}`} aria-live="polite">{(hoverHour != null ? hourTitle(hoverHour) : periodLine(period)) ?? '\u00a0'}</p>
    </PanelSection>
  );
}

/** The kinds of change the "summary" design counts, at the top bar's time of day. */
type SummaryKey = 'more' | 'less' | 'added' | 'removed';

/** Each changed route under its kind at the time of day: added, removed, or running more or less often then. */
function summaryGroups(file: StudioBeforeAfterFile, period: PeriodKey): Record<SummaryKey, StudioRouteChange[]> {
  const out: Record<SummaryKey, StudioRouteChange[]> = { more: [], less: [], added: [], removed: [] };
  for (const c of file.changes) {
    if (!c.before) out.added.push(c);
    else if (!c.after) out.removed.push(c);
    else { const k = periodChange(c.before, c.after, period); if (k === 'more' || k === 'less') out[k].push(c); }
  }
  return out;
}

/** One list row: both dates' figures at the time of day, the change's dot by the newer one (as the grouped list's rows). */
function periodRow(file: StudioBeforeAfterFile, c: StudioRouteChange, period: PeriodKey) {
  const [before, after] = (['before', 'after'] as const).map(side => periodCell(c[side], period));
  const change = rowChange(file, c, { key: period });
  return { key: c.route, route: routeTitle(c), value: <RouteListColumns cells={[before, { ...after, dot: change ? CHANGE_COLOR[change] : undefined }]} /> };
}

/**
 * CIV-2182 "summary" design (Ryan: "Yes i think but need to see a mokc up"): the panel opens on one bar counting each kind of
 * change at the time of day, and the map carries the detail; a part of the bar (or its legend) opens that kind's routes, a
 * route opens its card.
 */
function SummaryChanges({ file, period, onPick }: { file: StudioBeforeAfterFile; period: PeriodKey; onPick: (r: string) => void }) {
  const [open, setOpen] = useState<SummaryKey | null>(null);
  const groups = useMemo(() => summaryGroups(file, period), [file, period]);
  const R = STUDIO_REDESIGN_TEXT;
  const colour: Record<SummaryKey, string> = { more: CHANGE_COLOR.more, less: CHANGE_COLOR.less, added: 'var(--accent)', removed: CHANGE_COLOR.none };
  if (open) {
    return (
      <section aria-label={R.summary[open](groups[open].length)} className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-1"><SidebarCardHeader back={{ to: R.allChanges, onClick: () => setOpen(null) }} title={R.summary[open](groups[open].length)} /></div>
        <RouteListHeader label={PERIOD_LABELS[period]} columns={[dateRange(file.before.date, file.before.date), dateRange(file.after.date, file.after.date)]} />
        <PanelBody className="pb-2"><CardRouteList onSelect={onPick} rows={groups[open].map(c => periodRow(file, c, period))} /></PanelBody>
      </section>
    );
  }
  const keys = (['more', 'less', 'added', 'removed'] as const).filter(k => groups[k].length > 0);
  return (
    <div className="px-4 pb-3">
      <SplitBar label={R.summaryLabel} onPick={k => setOpen(k as SummaryKey)} segments={keys.map(k => ({
        key: k, value: groups[k].length, fill: colour[k], sentence: R.summary[k](groups[k].length), legend: R.summary[k](groups[k].length),
      }))} />
      {file.unchanged.length > 0 && <CardBodyText>{C.unchangedCount(file.unchanged.length)}</CardBodyText>}
    </div>
  );
}

/** The list of every changed route under its group's heading (today's page, and the "period" and "byPeriod" designs). */
function GroupedChangeList({ file, period, onPick, design }: { file: StudioBeforeAfterFile; period: PeriodKey; onPick: (r: string) => void; design: SchedulesDesign }) {
  const groups = useMemo(() => designGroups(changeGroups(file), period, design), [file, period, design]);
  // CIV-2057 (Ryan: "Why does the Schedules list look so different than a route list", then chose 1): the agency card's route
  // rows (CardRouteList), a column per compared date at the right with the change colour's dot by the newer figure, and the
  // time of day the figures are from at the end of the name line. Each value sits under its date (CIV-1806); the time of day
  // is the top bar's.
  return (
    <section aria-label={T.routes} className="flex min-h-0 flex-1 flex-col">
      <RouteListHeader label={T.routes} columns={[dateRange(file.before.date, file.before.date), dateRange(file.after.date, file.after.date)]} />
      <PanelBody className="pb-2">
        {groups.map((g, i) => (
          <div key={g.key}>
            <AgencyGroupHeader rule={i === 0 ? 'none' : 'above'}>{g.title}</AgencyGroupHeader>
            <CardRouteList onSelect={onPick} rows={g.routes.map(c => {
              // CIV-2182 "period" design: a route in this time of day's group shows this time of day's figures, no label.
              const f = design === 'period' && g.key === 'frequency' ? { ...rowFigure(c, period), ...periodFigureOf(c, period) } : rowFigure(c, period);
              // One short figure per cell, a late start or early end on its own line (CIV-1922). No bold on the newer
              // figure (Ryan, CIV-1806: "Does bold mean better frequency?").
              const [before, after] = (['before', 'after'] as const).map(side => (PERIOD_KEYS as readonly string[]).includes(f.key) ? periodCell(c[side], f.key as PeriodKey) : { main: f[side], note: null });
              // #1746: the dot is the change at the time of day the figures are from (rowChange), never the top bar's alone.
              const change = rowChange(file, c, f);
              return {
                key: c.route,
                route: routeTitle(c),
                // The group heading names the time of day in the "byPeriod" design, so the row doesn't repeat it.
                nameNote: design === 'byPeriod' ? undefined : f.label ?? undefined,
                value: <RouteListColumns cells={[before, { ...after, dot: change ? CHANGE_COLOR[change] : undefined }]} />,
              };
            })} />
          </div>
        ))}
        {file.unchanged.length > 0 && <CardBodyText className="px-4">{C.unchangedCount(file.unchanged.length)}</CardBodyText>}
      </PanelBody>
    </section>
  );
}

/** A route's figures at one time of day, as a row figure (CIV-2182 "period" design). */
function periodFigureOf(c: StudioRouteChange, period: PeriodKey) {
  return { key: period, label: null, ...pairFigures(c.before, c.after, period) };
}

/** Whether a route's frequency changed grade at this time of day, or it was added or removed (it runs then on one side). */
function changedAt(c: StudioRouteChange, period: PeriodKey): boolean {
  if (!c.before || !c.after) return c.before?.headway[period] != null || c.after?.headway[period] != null;
  return periodChange(c.before, c.after, period) !== 'same' && periodChange(c.before, c.after, period) !== 'none';
}

/**
 * CIV-2182 review designs for the list's groups (#1746: "Rows mix periods ... under one heading with no grouping").
 * "period": the frequency group keeps only routes that changed at the top bar's time of day; the rest of it move under
 * one heading after it. "byPeriod": the frequency group splits by the time of day each row's figure is from, the top
 * bar's first. "today": as now.
 */
function designGroups(groups: ChangeGroup[], period: PeriodKey, design: SchedulesDesign): ChangeGroup[] {
  if (design === 'today') return groups;
  return groups.flatMap(g => {
    if (g.key !== 'frequency') return [g];
    if (design === 'period') {
      const here = g.routes.filter(c => changedAt(c, period)), other = g.routes.filter(c => !changedAt(c, period));
      return [
        { key: 'frequency', title: `${g.title} · ${PERIOD_LABELS[period]}`, routes: here },
        { key: 'other-times', title: STUDIO_REDESIGN_TEXT.otherTimes, routes: other },
      ].filter(x => x.routes.length > 0);
    }
    const byKey = new Map<string, StudioRouteChange[]>();
    for (const c of g.routes) { const k = rowFigure(c, period).key; byKey.set(k, [...(byKey.get(k) ?? []), c]); }
    const order = [period, ...PERIOD_KEYS.filter(k => k !== period), 'trips'];
    return [...byKey.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(k => ({
      key: `frequency-${k}`,
      title: (PERIOD_KEYS as readonly string[]).includes(k) ? PERIOD_LABELS[k as PeriodKey] : STUDIO_CHANGES_TEXT.trips,
      routes: byKey.get(k)!,
    }));
  });
}

/** The map key in the regular map's key card and slot, bottom left above the footer (CIV-1821). */
function FleetMapKey({ beforeDate, afterDate }: { beforeDate: string; afterDate: string }) {
  const steps = (['more', 'less', 'same', 'none'] as const).map(k => ({ color: CHANGE_COLOR[k], label: T[k], className: 'text-xs text-[var(--text-primary)]' }));
  // CIV-1827: which line is which schedule, by its date (the change list's headers).
  const grey = CHANGE_COLOR.same;
  const sides = [
    { color: grey, label: dateRange(afterDate, afterDate), className: 'text-xs text-[var(--text-primary)]', swatchClassName: 'w-5' },
    { ...dashedLineSwatch(grey), label: dateRange(beforeDate, beforeDate), className: 'text-xs text-[var(--text-primary)]' },
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
  const menus: (StudioMenu | null)[] = [
    agencyMenu,
    // CIV-2001 (Ryan chose 1): no Route chip; the top bar's search box finds a route (StudioSearch.tsx).
    periods.length ? { key: 'period', label: TIME_LABEL, value: period, options: periodMenuOptions(periods), onPick: k => setPeriod(k as PeriodKey), panelClassName: 'w-56' } : null,
  ];
  return (
    <>
      <StudioChips container={headerPortal} menus={menus} />
      {/* The shared loading panel while the file comes in, then the shared empty line if there is none (CIV-1925 phase 4). */}
      {file == null && <ViewLoadingPanel what={agency} />}
      {file === 'missing' && <StudioPanel style={frameStyle}><PanelEmpty>{C.noData}</PanelEmpty></StudioPanel>}
      {ready && <Body view={view} slug={slug} file={ready} vehicles={vehicles} agency={agency} period={period} setPeriod={setPeriod} route={route} setRoute={setRoute} frameStyle={frameStyle} />}
    </>
  );
}

function Body({ view, slug, file, vehicles, agency, period, setPeriod, route, setRoute, frameStyle }: {
  view: FleetView; slug: string; file: StudioBeforeAfterFile; vehicles: StudioVehiclesFile | null | 'missing'; agency: string; period: PeriodKey; setPeriod: (p: PeriodKey) => void; route: string | null; setRoute: (r: string | null) => void; frameStyle: React.CSSProperties;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  // CIV-2001: the top bar's search finds the routes this page draws (the Route chip's list); results take the panel's place.
  const searchOpen = useStudioSearchOpen();
  const searchRoutes = useMemo(() => [...new Set([...Object.keys(file.lines?.after ?? {}), ...Object.keys(file.lines?.before ?? {}), ...file.changes.map(c => c.route)])]
    .map(r => ({ route: r, longName: file.changes.find(c => c.route === r)?.name ?? null })), [file]);
  const fleet = useMemo(() => (vehicles && vehicles !== 'missing' ? agencyFleet(vehicles, period) : null), [vehicles, period]);
  const routeGroup = route && vehicles && vehicles !== 'missing' ? groupFor(vehicles, route, period) : null;
  const inService = useInServiceNow(slug, routeGroup?.routes ?? null, period);
  // CIV-2182 "now" design: the agency's current time of day, its scheduled vehicles then and Live's count now, whatever the
  // top bar's time; the top bar's time gives the second "scheduled" figure.
  const { agencies } = useAgencies();
  // The agency's own "now", as the MCP reads it (scripts/mcp/nowClock.ts): its service day and time of day.
  const now = useMemo(() => { try { return agencyNow({ slug, name: agency }, agencies.find(a => a.slug === slug)?.timezone); } catch { return null; } }, [slug, agency, agencies]);
  const nowPeriod = (now?.period ?? getNowPeriodForTimezone(agencies.find(a => a.slug === slug)?.timezone)) as PeriodKey;
  // The fleet file is Weekday only (scripts/vehicles-needed.ts): on a Saturday or Sunday its counts are not today's, so
  // "Scheduled now" is left out rather than shown as today's.
  const nowFleet = useMemo(() => (now?.day === 'Weekday' && vehicles && vehicles !== 'missing' && (PERIOD_KEYS as readonly string[]).includes(nowPeriod) ? agencyFleet(vehicles, nowPeriod) : null), [now, vehicles, nowPeriod]);
  // CIV-2939: every vehicle on the road now, the recorder's whole-network count; read only while Fleet's agency panel shows.
  const runningNow = useNetworkInService(slug, view === 'fleet' && !route);
  // The words follow the modes even at a time of day with no service (CIV-2002).
  const routeModes = routeGroup?.modes ?? (route && vehicles && vehicles !== 'missing' ? modesFor(vehicles, route) : undefined);
  const agencyModes = fleet?.modes ?? (vehicles && vehicles !== 'missing' ? modesFor(vehicles, null) : undefined);
  // Fleet's map has no change story: the newer schedule's lines in one colour (its route list is Schedules').
  const lines = useMemo(() => {
    const all = studioMapLines(file, period, route);
    return view === 'schedules' ? all : all.filter(l => !l.dashed).map(l => ({ ...l, color: CHANGE_COLOR.same }));
  }, [file, period, route, view]);
  // The map's pick in a ref: a new callback each render would redraw the overlay every time.
  const setRouteRef = useRef(setRoute);
  setRouteRef.current = setRoute;
  const routeRef = useRef(route);
  routeRef.current = route;
  // #1748: an empty-map click or Escape (a null pick) closes the open route, as on the main map.
  const onPick = useMemo(() => (p: MapPick | null) => {
    if (p?.kind === 'line' && p.route) setRouteRef.current(p.route);
    else if (!p && routeRef.current) setRouteRef.current(null);
  }, []);
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
      {searchOpen ? (
        <StudioRouteSearch agencySlug={slug} agencyName={agency} routes={searchRoutes} onPick={setRoute} frameStyle={frameStyle} />
      ) : route && routeLabel ? (
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
                  {schedulesDesign() === 'summary' && <ScheduleSparklines change={change} period={period} beforeDate={file.before.date} afterDate={file.after.date} />}
                </SidebarCardSection>
              )}
              {view === 'fleet' && (
                <SidebarCardSection label={vehiclesTitleText(dateRange(file.after.date, file.after.date), routeModes) || vehiclesNeededTitle(routeModes)}>
                  {/* CIV-2003: a line inside the card is the card's body text. */}
                  {vehicles === 'missing' ? <CardBodyText className="!mt-0">{C.noData}</CardBodyText>
                    : routeGroup ? <StudioGroupFigures group={routeGroup} inService={inService} /> : vehicles ? <StudioGroupFigures group={null} modes={routeModes} />
                    // CIV-2003: while the vehicles load, the shared loading line in the mode word, as the no-service line.
                    : <CardLoadingLine what={vehiclesWord(routeModes)} />}
                </SidebarCardSection>
              )}
            </SidebarCardShell>
          </PanelBody>
        </StudioPanel>
      ) : view === 'fleet' && vehicles == null ? (
        // CIV-2003: while the vehicles file loads, the one shared loading panel, in the mode word the no-service line uses.
        <ViewLoadingPanel what={vehiclesWord(agencyModes)} />
      ) : view === 'fleet' ? (
        // CIV-1922: Fleet opens on the fleet itself, the vehicles the whole agency needs at the time of day. CIV-2002 (Ryan:
        // "This panel looks different than any other panel in Atlas"): Live's agency panel, a plain body and one Widget card.
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={vehiclesNeededTitle(agencyModes)}>
          {/* CIV-2003: PanelBody is the shared scroll area; an empty panel says so in the shared line, a lead line is card body text. */}
          <PanelBody className={vehicles === 'missing' ? undefined : 'px-4 pt-3 pb-3'}>
            {vehicles === 'missing' ? <PanelEmpty>{C.noData}</PanelEmpty>
              : vehicles ? (
                <>
                  {/* CIV-2182 (Ryan: the intro shorter and maybe moved): a short grey caption, the route count. No date (Ryan,
                      2026-11-25: "the question was why the fuck is this date here at all"). */}
                  {fleet && <p className={`m-0 mb-1 ${CARD_NOTE}`}>{STUDIO_REDESIGN_TEXT.fleetCaption(agencyRouteCount(vehicles, period))}</p>}
                  {/* CIV-2182 (Ryan: the card inside a card looks odd): sections of the panel, as Studio's Live route panel (CIV-2021). */}
                  <PanelSectionsProvider>
                    <Widget title={vehiclesNeededTitle(agencyModes)}>
                      <FleetNowTable modes={agencyModes} runningNow={runningNow} scheduledNow={nowFleet?.scheduled ?? null} />
                    </Widget>
                    <FleetPeriodSparkline vehicles={vehicles} period={period} setPeriod={setPeriod} modes={agencyModes} />
                  </PanelSectionsProvider>
                </>
              ) : null}
          </PanelBody>
        </StudioPanel>
      ) : (
        <StudioPanel ref={cardRef} style={frameStyle} aria-label={PAGE_NAMES.studioSchedules}>
          <PanelTitleBar title={PAGE_NAMES.studioSchedules} />
          <div className="shrink-0 px-4 pt-2">
            <CardBodyText>{intro}</CardBodyText>
            {leftOut.map(n => <CardBodyText key={n}>{n}</CardBodyText>)}
          </div>
          <ChangeList file={file} period={period} onPick={setRoute} design={schedulesDesign()} />
        </StudioPanel>
      )}
      {view === 'schedules' && <FleetMapKey beforeDate={file.before.date} afterDate={file.after.date} />}
    </>
  );
}
