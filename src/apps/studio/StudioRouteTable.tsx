import ScrollX from '../../components/ui/ScrollX';
import DataTable from '../../components/ui/DataTable';
import { routeLabels } from '../../utils/format';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../../../shared/config';
import { headwayAmount, headwayEveryRange } from '../../../shared/headwayText';
import { clockTime } from '../../../shared/timeText';
import { countText } from '../../../shared/numberText';
import { MISSING_VALUE } from '../../../shared/missingValue';
import { dateRange } from '../../../shared/dateText';
import { STOPS_TERM } from '../../../shared/liveGlossary';
import { periodEdgeText } from '../../utils/effectiveHeadway';
import { tidyStopName } from '../../utils/segmentDelayView';
import type { StudioRouteChange, StudioRouteDay } from '../../../shared/studioBeforeAfter';
import { STUDIO_CHANGES_TEXT, STUDIO_MAP_TEXT, routeEndsText } from '../../../shared/studioWording';

const ROUTE_LABEL = STUDIO_MAP_TEXT.route;

/**
 * Atlas Studio's before/after schedule figures (CIV-1715), now Fleet's route card (CIV-1828, Fleet.tsx). What
 * two versions of an agency's schedule say for the compared day type (weekdays for Kingston), from CIV-1684's comparison
 * engine: per route, the map's frequency by time of day, trips, first and last trip and trip time. Routes are grouped by
 * how big the change is (shared/studioBeforeAfter.ts `changeSize`), so a minute of span or trip time doesn't read as a
 * headline. Its words are in shared/studioWording.ts.
 */


const T = STUDIO_CHANGES_TEXT;
/** The periods every route table shows; Late and Overnight join only where either side has a figure. */
const MAIN_PERIODS: PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening'];

const runText = (d: StudioRouteDay | null) => (d?.runMinutes.length ? headwayEveryRange(d.runMinutes[0], d.runMinutes[d.runMinutes.length - 1], true) : MISSING_VALUE);
/**
 * A time of day's figure: the route card's own words where the period starts late or ends early ("every 15 min from 10:12
 * AM", periodEdgeText; CIV-1806), else the map's frequency.
 */
export function periodFigure(d: StudioRouteDay | null, k: PeriodKey): string {
  if (!d) return MISSING_VALUE;
  const edge = d.edge?.[k];
  return edge ? periodEdgeText(edge) : headwayAmount(d.headway[k]);
}
const clockOrMissing = (m: number | null | undefined) => (m == null ? MISSING_VALUE : clockTime(m));

interface FigureRow { key: string; label: string; before: string; after: string }

/** One route's figures as rows: frequency by time of day, trips, first and last trip, trip time. */
export function routeFigureRows(c: Pick<StudioRouteChange, 'before' | 'after'>): FigureRow[] {
  const { before: b, after: a } = c;
  const periods = PERIOD_KEYS.filter(k => MAIN_PERIODS.includes(k) || b?.headway[k] != null || a?.headway[k] != null);
  return [
    ...periods.map(k => ({ key: k, label: PERIOD_LABELS[k], before: periodFigure(b, k), after: periodFigure(a, k) })),
    { key: 'trips', label: T.trips, before: b ? countText(b.trips) : MISSING_VALUE, after: a ? countText(a.trips) : MISSING_VALUE },
    { key: 'first', label: T.firstTrip, before: clockOrMissing(b?.first), after: clockOrMissing(a?.first) },
    { key: 'last', label: T.lastTrip, before: clockOrMissing(b?.last), after: clockOrMissing(a?.last) },
    { key: 'run', label: T.tripTime, before: runText(b), after: runText(a) },
  ];
}

/** A small change in one line: only what differs, "First trip 6:10 AM → 6:08 AM, Trip time 43–46 min → 45 min". */
export function smallChangeParts(c: StudioRouteChange): string[] {
  return routeFigureRows(c).filter(r => r.before !== r.after).map(r => `${r.label} ${r.before} → ${r.after}`);
}


export const routeTitle = (c: Pick<StudioRouteChange, 'route' | 'name'>) => routeLabels({ shortName: c.route, longName: c.name });

/** A route's end stops on one side, feed capitals in title case (tidyStopName, as Live's cards). */
const endsText = (d: StudioRouteDay | null) => (d?.ends ? routeEndsText([tidyStopName(d.ends[0]), tidyStopName(d.ends[1])]) : MISSING_VALUE);

/** A route's stop count on one side: "26" or "26–28" across its patterns. */
const stopsText = (d: StudioRouteDay | null) => (d?.stops ? (d.stops[0] === d.stops[1] ? countText(d.stops[0]) : `${countText(d.stops[0])}–${countText(d.stops[1])}`) : MISSING_VALUE);

/**
 * The route's length on each side (CIV-1827), above its other figures so a longer trip time has its reason right above
 * it: its end stops and its stops. Left out where neither side has them (files built before CIV-1827).
 */
export function routeShapeRows(c: Pick<StudioRouteChange, 'before' | 'after'>): FigureRow[] {
  const { before: b, after: a } = c;
  if (!b?.ends && !a?.ends) return [];
  return [
    { key: 'ends', label: ROUTE_LABEL, before: endsText(b), after: endsText(a) },
    { key: 'stops', label: STOPS_TERM, before: stopsText(b), after: stopsText(a) },
  ];
}

/**
 * The open route's figures under the two schedules' dates (CIV-1827, as the change list's columns): its length first,
 * then trip time, frequency by time of day (the top bar's marked, no header repeating it), trips and first and last
 * trip. No bold (Ryan, CIV-1806: bold read as better frequency).
 */
export function StudioRouteTable({ change, beforeDate, afterDate, period }: { change: StudioRouteChange; beforeDate: string; afterDate: string; period: PeriodKey }) {
  const label = routeTitle(change);
  const figures = routeFigureRows(change);
  const run = figures.find(r => r.key === 'run')!;
  const rows = [...routeShapeRows(change), run, ...figures.filter(r => r.key !== 'run')];
  return (
    <div data-route={change.route}>
    <ScrollX className="-mx-2">
      <DataTable
        caption={label.text}
        layout="fixed"
        rows={rows}
        rowKey={r => r.key}
        rowCurrent={r => r.key === period}
        columns={[
          { key: 'label', header: '', rowHeader: true, width: 6, className: 'font-normal', cell: r => r.label },
          { key: 'before', header: dateRange(beforeDate, beforeDate), width: 6.5, cell: (r: FigureRow) => r.before },
          { key: 'after', header: dateRange(afterDate, afterDate), width: 6.5, cell: (r: FigureRow) => r.after },
        ]}
      />
    </ScrollX>
    </div>
  );
}
