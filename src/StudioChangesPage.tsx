import { SubsectionTitle } from './components/ui/PageTitle';
import { PageTable } from './components/ui/PageSection';
import DataTable from './components/ui/DataTable';
import { RouteTitleName } from './components/RouteRowName';
import { routeLabels } from './utils/format';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { headwayAmount, headwayEveryRange } from '../shared/headwayText';
import { clockTime } from '../shared/timeText';
import { countText } from '../shared/numberText';
import { MISSING_VALUE } from '../shared/missingValue';
import type { StudioRouteChange, StudioRouteDay } from '../shared/studioBeforeAfter';
import { STUDIO_CHANGES_TEXT } from '../shared/studioWording';

/**
 * Atlas Studio's before/after schedule figures (CIV-1715), now the Studio map's sidebar (CIV-1731, StudioPage.tsx). What
 * two versions of an agency's schedule say for the compared day type (weekdays for Kingston), from CIV-1684's comparison
 * engine: per route, the map's frequency by time of day, trips, first and last trip and trip time. Routes are grouped by
 * how big the change is (shared/studioBeforeAfter.ts `changeSize`), so a minute of span or trip time doesn't read as a
 * headline. Its words are in shared/studioWording.ts.
 */


const T = STUDIO_CHANGES_TEXT;
/** The periods every route table shows; Late and Overnight join only where either side has a figure. */
const MAIN_PERIODS: PeriodKey[] = ['amPeak', 'midday', 'pmPeak', 'evening'];

const runText = (d: StudioRouteDay | null) => (d?.runMinutes.length ? headwayEveryRange(d.runMinutes[0], d.runMinutes[d.runMinutes.length - 1], true) : MISSING_VALUE);
const clockOrMissing = (m: number | null | undefined) => (m == null ? MISSING_VALUE : clockTime(m));

interface FigureRow { key: string; label: string; before: string; after: string }

/** One route's figures as rows: frequency by time of day, trips, first and last trip, trip time. */
export function routeFigureRows(c: Pick<StudioRouteChange, 'before' | 'after'>): FigureRow[] {
  const { before: b, after: a } = c;
  const periods = PERIOD_KEYS.filter(k => MAIN_PERIODS.includes(k) || b?.headway[k] != null || a?.headway[k] != null);
  return [
    ...periods.map(k => ({ key: k, label: PERIOD_LABELS[k], before: b ? headwayAmount(b.headway[k]) : MISSING_VALUE, after: a ? headwayAmount(a.headway[k]) : MISSING_VALUE })),
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

/** A route's before/after table: one row per figure, the after value in bold where it changed. */
export function StudioRouteTable({ change }: { change: StudioRouteChange }) {
  const label = routeTitle(change);
  const rows = routeFigureRows(change);
  const one = !change.before || !change.after;
  return (
    <div className="min-w-0" data-route={change.route}>
      <SubsectionTitle><RouteTitleName label={label} /></SubsectionTitle>
      <PageTable>
        <DataTable
          caption={label.text}
          layout="fixed"
          rows={rows}
          rowKey={r => r.key}
          columns={[
            { key: 'label', header: '', rowHeader: true, width: 8, className: 'font-normal', cell: r => r.label },
            ...(change.before ? [{ key: 'before', header: T.before, width: 6.5, cell: (r: FigureRow) => r.before }] : []),
            ...(change.after ? [{ key: 'after', header: T.after, width: 6.5, cell: (r: FigureRow) => <span className={!one && r.before !== r.after ? 'font-bold' : ''}>{r.after}</span> }] : []),
          ]}
        />
      </PageTable>
    </div>
  );
}
