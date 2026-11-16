import { useEffect, useState } from 'react';
import PageShell from './components/ui/PageShell';
import StudioNav from './components/StudioNav';
import { PageTitle, SubsectionTitle } from './components/ui/PageTitle';
import PageSection, { PAGE_SECTION_NOTE, PageTable } from './components/ui/PageSection';
import DataTable from './components/ui/DataTable';
import { RouteTitleName } from './components/RouteRowName';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { routeLabels, routesShortLabel } from './utils/format';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { PAGE_NAMES, tabTitle } from '../shared/pageNames';
import { headwayAmount, headwayEveryRange, capitalizeFirst } from '../shared/headwayText';
import { clockTime } from '../shared/timeText';
import { countText } from '../shared/numberText';
import { shortDate } from '../shared/dateText';
import { dayInSentence, dayPlural } from '../shared/dayTypes';
import { joinList, plural } from '../shared/overflowText';
import { MISSING_VALUE } from '../shared/missingValue';
import { frequencyMoved, studioBeforeAfterDevUrl, type StudioBeforeAfterFile, type StudioRouteChange, type StudioRouteDay } from '../shared/studioBeforeAfter';
import { STUDIO_DEFAULT_AGENCY } from './StudioVehiclesPage';

/**
 * Atlas Studio's before/after schedule report (CIV-1715), local only (FEATURES.studio). What two versions of an agency's
 * schedule say for the compared day type (weekdays for Kingston), from CIV-1684's comparison engine: per route, the
 * map's frequency by time of day, trips, first and last trip and trip time. Routes are grouped by how big the change is
 * (shared/studioBeforeAfter.ts `changeSize`), so a minute of span or trip time doesn't read as a headline.
 * The numbers come from `scripts/compare-feed-dates.ts --json`, served by the Vite dev server.
 * Every string here is proposed and waiting on Ryan's word-for-word OK.
 */

export const STUDIO_CHANGES_TEXT = {
  intro: (agency: string, day: string, before: string, after: string) => `How the ${agency} ${day} schedule changed between ${before} and ${after}.`,
  leftOut: (days: string, newer: boolean) => `${days} aren’t compared: the ${newer ? 'newer' : 'older'} schedule file’s calendar leaves out many of their trips.`,
  frequencyTitle: 'Frequency or Trips Changed',
  hoursTitle: 'First or Last Trip or Trip Time Changed',
  addedTitle: (n: number) => plural(n, 'Route Added', 'Routes Added'),
  removedTitle: (n: number) => plural(n, 'Route Removed', 'Routes Removed'),
  smallTitle: 'Small Changes',
  smallIntro: 'Frequency or trip time moved by less than 5 min, first or last trip by less than 15 min, or trips by 1 or 2.',
  unchanged: (routes: string) => `No change: ${routes}.`,
  before: 'Before',
  after: 'After',
  route: 'Route',
  changed: 'Changed',
  trips: 'Trips',
  firstTrip: 'First trip',
  lastTrip: 'Last trip',
  tripTime: 'Trip time',
  noData: 'No data for this agency yet.',
  noDay: 'These two schedules couldn’t be compared.',
} as const;

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

/** The parts in a line, each kept whole so a time never breaks from its AM or PM. */
function SmallChange({ change }: { change: StudioRouteChange }) {
  const parts = smallChangeParts(change);
  return <>{parts.map((p, i) => <span key={p}><span className="whitespace-nowrap">{p}</span>{i < parts.length - 1 ? ', ' : ''}</span>)}</>;
}

const routeTitle = (c: StudioRouteChange) => routeLabels({ shortName: c.route, longName: c.name });

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
            { key: 'label', header: '', rowHeader: true, width: 9, className: 'font-normal', cell: r => r.label },
            ...(change.before ? [{ key: 'before', header: T.before, width: 7, cell: (r: FigureRow) => r.before }] : []),
            ...(change.after ? [{ key: 'after', header: T.after, width: 7, cell: (r: FigureRow) => <span className={!one && r.before !== r.after ? 'font-bold' : ''}>{r.after}</span> }] : []),
          ]}
        />
      </PageTable>
    </div>
  );
}

function RouteTables({ changes }: { changes: StudioRouteChange[] }) {
  return <div className="mt-6 grid gap-x-12 gap-y-8 md:grid-cols-2">{changes.map(c => <StudioRouteTable key={c.route} change={c} />)}</div>;
}

/** The report itself, from one file. */
export function StudioChangesReport({ file, agency }: { file: StudioBeforeAfterFile; agency: string }) {
  if (!file.day) return <p className={PAGE_SECTION_NOTE}>{T.noDay}</p>;
  const of = (size: StudioRouteChange['size']) => file.changes.filter(c => c.size === size && c.before && c.after);
  const added = file.changes.filter(c => !c.before), removed = file.changes.filter(c => !c.after);
  // Routes whose frequency moved lead, then those where only the trip count did; route order inside each.
  const frequency = [...of('frequency').filter(c => frequencyMoved(c.before, c.after)), ...of('frequency').filter(c => !frequencyMoved(c.before, c.after))];
  const hours = of('hours'), small = of('small');
  const leftOutNotes = (['after', 'before'] as const).map(side => {
    const days = file.leftOut.filter(l => l.sides.includes(side)).map(l => capitalizeFirst(dayPlural(l.day)));
    return days.length ? T.leftOut(joinList(days), side === 'after') : null;
  }).filter(Boolean);
  return (
    <>
      <p className={PAGE_SECTION_NOTE}>{T.intro(agency, dayInSentence(file.day), shortDate(file.before.date) ?? file.before.date, shortDate(file.after.date) ?? file.after.date)}</p>
      {leftOutNotes.map(n => <p key={n} className={PAGE_SECTION_NOTE}>{n}</p>)}
      {frequency.length > 0 && <PageSection id="studio-changes-frequency" title={T.frequencyTitle}><RouteTables changes={frequency} /></PageSection>}
      {hours.length > 0 && <PageSection id="studio-changes-hours" title={T.hoursTitle}><RouteTables changes={hours} /></PageSection>}
      {added.length > 0 && <PageSection id="studio-changes-added" title={T.addedTitle(added.length)}><RouteTables changes={added} /></PageSection>}
      {removed.length > 0 && <PageSection id="studio-changes-removed" title={T.removedTitle(removed.length)}><RouteTables changes={removed} /></PageSection>}
      {small.length > 0 && (
        <PageSection id="studio-changes-small" title={T.smallTitle} intro={T.smallIntro}>
          <PageTable>
            <DataTable
              caption={T.smallTitle}
              layout="content"
              rows={small}
              rowKey={c => c.route}
              columns={[
                { key: 'route', header: T.route, rowHeader: true, className: 'font-normal whitespace-nowrap align-top', cell: c => <span className="font-black">{routeTitle(c).primary}</span> },
                { key: 'changed', header: T.changed, className: 'text-[var(--text-muted)]', cell: c => <SmallChange change={c} /> },
              ]}
            />
          </PageTable>
        </PageSection>
      )}
      {file.unchanged.length > 0 && <p className={`mt-10 ${PAGE_SECTION_NOTE}`}>{T.unchanged(routesShortLabel(file.unchanged))}</p>}
    </>
  );
}

export default function StudioChangesPage() {
  // One demo agency for now (Kingston), as Buses Needed.
  const slug = STUDIO_DEFAULT_AGENCY;
  const agency = useLiveAgencyName(slug);
  const [file, setFile] = useState<StudioBeforeAfterFile | null | 'missing'>(null);

  useEffect(() => { document.title = tabTitle(PAGE_NAMES.studioChanges, agency); }, [agency]);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<StudioBeforeAfterFile | 'missing'> => {
      try {
        const r = await fetch(studioBeforeAfterDevUrl(slug));
        return r.ok ? await r.json() as StudioBeforeAfterFile : 'missing';
      } catch { return 'missing'; }
    };
    void load().then(f => { if (live) setFile(f); });
    return () => { live = false; };
  }, [slug]);

  return (
    <PageShell>
      <div className="mt-10">
        <StudioNav current="studioChanges" />
        <PageTitle>{PAGE_NAMES.studioChanges}</PageTitle>
        {file === 'missing' && <p className={PAGE_SECTION_NOTE}>{T.noData}</p>}
        {file && file !== 'missing' && <StudioChangesReport file={file} agency={agency} />}
      </div>
    </PageShell>
  );
}
