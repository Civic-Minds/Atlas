import { useMemo } from 'react';
import { Bus } from 'lucide-react';
import Panel, { PanelBody, PanelTitleBar } from '../components/ui/Panel';
import PillGroup from '../components/ui/PillGroup';
import PanelEmpty from '../components/ui/PanelEmpty';
import CardRouteList from '../components/Interval/CardRouteList';
import { CARD_SUMMARY, CardSectionLabel } from '../components/Interval/cardUi';
import ResearchInfo from '../components/ResearchInfo';
import { outdatedLabel } from '../components/research/BustangCardSections';
import { loadingText, NO_BUSTANG_TRIPS } from '../content/noticeCopy';
import { shortDate } from '../../shared/dateText';
import { countOf } from '../../shared/overflowText';
import { DAY_TYPES, type DayType } from '../../shared/dayTypes';
import { LIST_DISTANCE_CHOICES, parseNearbyChoice, type NearbyChoice } from '../../shared/connections';
import { FEATURES } from '../../shared/config';
import { compareRouteNumber } from '../utils/sortCompare';
import { BUSTANG_INFO_HEADING, BUSTANG_LIST_TITLE, scheduleEnded, type BustangData } from '../utils/bustangConnections';
import { metresText } from '../../shared/unitText';

/**
 * Bustang connections (CIV-101, beta only): the regular map, limited to Bustang and the local agencies at its stops,
 * with this info card and a list of Bustang routes, as the Night Service view does. Opening a route shows its
 * departures on the route card; a stop's card shows its Bustang connections (BustangCardSections). Day and walking
 * distance live here so they work on phones too. All wording is a draft for Ryan's word-for-word OK.
 */


interface Props {
  active: boolean;
  data: BustangData | null;
  day: DayType;
  setDay: (day: DayType) => void;
  within: NearbyChoice;
  setWithin: (within: NearbyChoice) => void;
  sidebarLeft?: number;
  searchBarWidth?: number;
  onRouteSelect: (agencySlug: string, routeId: string) => void;
  onBackToMap: () => void;
  selectionActive?: boolean;
}

export default function BustangConnections({ active, data, day, setDay, within, setWithin, sidebarLeft, searchBarWidth, onRouteSelect, onBackToMap, selectionActive = false }: Props) {
  const routes = useMemo(() => {
    if (!data) return [];
    const byRoute = new Map<string, { routeId: string; routeName: string; trips: number }>();
    for (const t of data.trips[day]) {
      const r = byRoute.get(t.routeId) ?? { routeId: t.routeId, routeName: t.routeName, trips: 0 };
      r.trips += 1;
      byRoute.set(t.routeId, r);
    }
    return [...byRoute.values()].sort((a, b) => compareRouteNumber(a.routeName, b.routeName, null, null));
  }, [data, day]);
  const outdated = data ? [data.hub, ...Object.values(data.agencies)].filter(a => scheduleEnded(a, data.hub.timezone)) : [];

  if (!active) return null;
  return (
    <ResearchInfo heading={BUSTANG_INFO_HEADING} onBack={onBackToMap} sidebarLeft={sidebarLeft} searchBarWidth={searchBarWidth} hidden={selectionActive} below={
      <Panel sidebarSurface className="min-h-0 flex-1">
        <PanelTitleBar icon={<Bus className="w-3 h-3 text-[var(--text-dim)] shrink-0" />} title={BUSTANG_LIST_TITLE} />
        <PanelBody>
          <div className="px-3 pt-3 pb-1 space-y-2">
            {/* With the connections top bar (local only, CIV-1353), Day and distance live in the bar instead. */}
            {!FEATURES.connectionsBar && <>
            <div>
              <CardSectionLabel>Day</CardSectionLabel>
              <PillGroup label="Day" value={day} onChange={v => setDay(v as DayType)}
                options={DAY_TYPES.map(d => [d, d] as const)} />
            </div>
            <div>
              <CardSectionLabel>Local stop within</CardSectionLabel>
              <PillGroup label="Local stop within" value={String(within)} onChange={v => setWithin(parseNearbyChoice(v))}
                options={LIST_DISTANCE_CHOICES.map(m => [String(m), metresText(m)] as const)} />
            </div>
            </>}
            {data && <p className={CARD_SUMMARY}>Schedules for {shortDate(data.dates[day])}.</p>}
            {outdated.map(a => <p key={a.name} className="text-xs text-[var(--text-muted)]">{a.name}: {outdatedLabel(a)}</p>)}
          </div>
          {!data && <PanelEmpty kind="loading">{loadingText('Bustang connections')}</PanelEmpty>}
          {data && routes.length === 0 && <PanelEmpty>{NO_BUSTANG_TRIPS}</PanelEmpty>}
          {/* With the connections top bar (local only, CIV-1353, Ryan 2026-11-13, 11b), the route is picked on the map, not from this list. */}
          {data && routes.length > 0 && !FEATURES.connectionsBar && (
            <CardRouteList
              rows={routes.map(r => ({ key: r.routeId, route: { primary: r.routeName, secondary: undefined }, subLabel: countOf(r.trips, 'trip') }))}
              onSelect={routeId => onRouteSelect(data.hub.slug, routeId)}
            />
          )}
        </PanelBody>
      </Panel>
    }>
      How long riders wait for a local bus after getting off Bustang, and before catching it. Open a Bustang route for its departures, or a stop for its connections.
    </ResearchInfo>
  );
}
