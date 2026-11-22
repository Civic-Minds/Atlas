import DataTable from '../../components/ui/DataTable';
import ScrollX from '../../components/ui/ScrollX';
import { CardBodyText } from '../../components/Interval/cardUi';
import { PAGE_NAMES } from '../../../shared/pageNames';
import { headwayEvery, runTimeAmount } from '../../../shared/headwayText';
import { FREQUENCY_LABEL } from '../../content/noticeCopy';
import { MISSING_VALUE } from '../../../shared/missingValue';
import { groupAtTarget, STUDIO_TARGETS, type StudioBranchSplit, type StudioVehicleGroup } from '../../../shared/studioVehicles';
import { STUDIO_VEHICLES_TEXT, fleetNetworkText, groupSharesText, noServiceText } from '../../../shared/studioWording';

/**
 * Atlas Studio's buses-needed figures (CIV-1693), now in Fleet's route card (CIV-1828, Fleet.tsx): the picked route's
 * group of routes that share buses (Kingston runs each direction as its own route, so one route alone overstates), at
 * the top bar's time of day. The numbers come from `scripts/vehicles-needed.ts --json`, served by the Vite dev server;
 * see shared/studioVehicles.ts. Its words are in shared/studioWording.ts.
 */



const T = STUDIO_VEHICLES_TEXT;

/** A row of the buses table: a frequency (or the schedule now) and the buses it needs. */
interface BusRow { key: string; label: string; value: string | number; now?: boolean }

/**
 * The buses table's rows (CIV-1827): buses needed at each target frequency, best first, with the schedule now as a marked
 * row placed by its bus count, so the comparison reads straight down. Where the buses the schedule's own frequency needs
 * differ from those on the road, the now row says so in a second line.
 */
export function busRows(g: StudioVehicleGroup, split: StudioBranchSplit = 'current', inService: number | null = null): BusRow[] {
  const atTarget = groupAtTarget(g, split);
  // CIV-2002 (Ryan: "is this network-wide?"): one number for the schedule, the buses its own frequencies need, worked out
  // as the target rows are, so the rows compare straight down; the route card reads the same as the network table.
  const now: BusRow = { key: 'now', label: fleetNetworkText(g.modes).asScheduled, value: g.implied, now: true };
  const targets: BusRow[] = STUDIO_TARGETS.map(hw => ({ key: `at-${hw}`, label: headwayEvery(hw), value: atTarget[hw] ?? MISSING_VALUE }));
  // The now row goes before the first target needing fewer buses (after any needing the same).
  // CIV-2056: the vehicles Live sees on the road right now, straight under the schedule's row.
  const sched: BusRow[] = inService == null ? [now] : [now, { key: 'live', label: fleetNetworkText(g.modes).inServiceNow, value: inService }];
  const at = targets.findIndex(r => typeof r.value === 'number' && r.value < g.implied);
  return at < 0 ? [...targets, ...sched] : [...targets.slice(0, at), ...sched, ...targets.slice(at)];
}

/**
 * The open route's buses (CIV-1827): why other routes count too where they share its buses, the buses table, then running
 * time and layover in one line. A shared middle's trips keep the branches' current mix (CIV-1712's choice is gone: its
 * words were never approved and read as nothing to a planner).
 */
export function StudioGroupFigures({ group, showRunning = true, network = false, modes, inService = null }: { group: StudioVehicleGroup | null; showRunning?: boolean; /** The whole agency's table (CIV-2002): its rows read "If every route ran every 15 min". */ network?: boolean; /** The modes for the no-service line, when there is no group to read them from. */ modes?: readonly number[]; /** CIV-2056: the group's vehicles on the road now, from Live; null leaves the row out. */ inService?: number | null }) {
  // CIV-2003: lines in the card are the shared card body text, as the route card's no-data line.
  if (!group) return <CardBodyText className="!mt-0">{noServiceText(modes)}</CardBodyText>;
  const N = fleetNetworkText(group.modes);
  return (
    <>
    {group.routes.length > 1 && <CardBodyText className="!mt-0 mb-2">{groupSharesText(group.routes, group.modes)}</CardBodyText>}
    {/* -mx-2: the marked row's tint reaches past the text while the words line up with the lines above and below. */}
    <ScrollX className="-mx-2">
      <DataTable
        caption={PAGE_NAMES.studioVehicles}
        layout="fill"
        rows={busRows(group, 'current', inService)}
        rowKey={r => r.key}
        rowCurrent={r => !!r.now}
        columns={[
          { key: 'label', header: network ? N.ifEveryRouteRan : FREQUENCY_LABEL, rowHeader: true, width: 9, className: 'font-normal', cell: r => r.label },
          // CIV-1925 (Ryan: Fleet's spacing "looks odd"): the full panel width with the figures at its right edge, as Live's
          // and Schedules' tables (layout fill).
          { key: 'value', header: <span className="block text-right">{network ? N.count : T.needed}</span>, className: 'text-right', cell: r => r.value },
        ]}
      />
    </ScrollX>
    {showRunning && <p className="m-0 mt-2 text-sm">
      <span className="text-[var(--text-muted)]">{T.running}</span> {runTimeAmount(group.runningMin)}
      {' · '}<span className="text-[var(--text-muted)]">{T.layover}</span> {runTimeAmount(group.layoverMin)}
    </p>}
    </>
  );
}
