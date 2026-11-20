import DataTable from '../../components/ui/DataTable';
import ScrollX from '../../components/ui/ScrollX';
import { PAGE_NAMES } from '../../../shared/pageNames';
import { headwayEvery, runTimeAmount } from '../../../shared/headwayText';
import { FREQUENCY_LABEL } from '../../content/noticeCopy';
import { MISSING_VALUE } from '../../../shared/missingValue';
import { groupAtTarget, STUDIO_TARGETS, type StudioBranchSplit, type StudioVehicleGroup } from '../../../shared/studioVehicles';
import { STUDIO_VEHICLES_TEXT, groupSharesText } from '../../../shared/studioWording';

/**
 * Atlas Studio's buses-needed figures (CIV-1693), now in Fleet's route card (CIV-1828, Fleet.tsx): the picked route's
 * group of routes that share buses (Kingston runs each direction as its own route, so one route alone overstates), at
 * the top bar's time of day. The numbers come from `scripts/vehicles-needed.ts --json`, served by the Vite dev server;
 * see shared/studioVehicles.ts. Its words are in shared/studioWording.ts.
 */



const T = STUDIO_VEHICLES_TEXT;

/** A row of the buses table: a frequency (or the schedule now) and the buses it needs. */
interface BusRow { key: string; label: string; value: string | number; now?: boolean; note?: string }

/**
 * The buses table's rows (CIV-1827): buses needed at each target frequency, best first, with the schedule now as a marked
 * row placed by its bus count, so the comparison reads straight down. Where the buses the schedule's own frequency needs
 * differ from those on the road, the now row says so in a second line.
 */
export function busRows(g: StudioVehicleGroup, split: StudioBranchSplit = 'current'): BusRow[] {
  const atTarget = groupAtTarget(g, split);
  const now: BusRow = { key: 'now', label: T.scheduled, value: g.scheduled, now: true, ...(g.implied !== g.scheduled ? { note: `${T.needed} ${g.implied}` } : {}) };
  const targets: BusRow[] = STUDIO_TARGETS.map(hw => ({ key: `at-${hw}`, label: headwayEvery(hw), value: atTarget[hw] ?? MISSING_VALUE }));
  // The now row goes before the first target needing fewer buses (after any needing the same).
  const at = targets.findIndex(r => typeof r.value === 'number' && r.value < g.scheduled);
  return at < 0 ? [...targets, now] : [...targets.slice(0, at), now, ...targets.slice(at)];
}

/**
 * The open route's buses (CIV-1827): why other routes count too where they share its buses, the buses table, then running
 * time and layover in one line. A shared middle's trips keep the branches' current mix (CIV-1712's choice is gone: its
 * words were never approved and read as nothing to a planner).
 */
export function StudioGroupFigures({ group, showRunning = true }: { group: StudioVehicleGroup | null; showRunning?: boolean }) {
  if (!group) return <p className="m-0 text-sm text-[var(--text-muted)]">{T.noService}</p>;
  return (
    <>
    {group.routes.length > 1 && <p className="m-0 mb-2 text-sm text-[var(--text-secondary)]">{groupSharesText(group.routes)}</p>}
    {/* -mx-2: the marked row's tint reaches past the text while the words line up with the lines above and below. */}
    <ScrollX className="-mx-2">
      <DataTable
        caption={PAGE_NAMES.studioVehicles}
        layout="fixed"
        rows={busRows(group)}
        rowKey={r => r.key}
        rowCurrent={r => !!r.now}
        columns={[
          { key: 'label', header: FREQUENCY_LABEL, rowHeader: true, width: 9, className: 'font-normal', cell: r => (
            <>{r.label}{r.note && <span className="block text-[var(--text-muted)]">{r.note}</span>}</>
          ) },
          { key: 'value', header: T.needed, width: 4.5, cell: r => r.value },
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
