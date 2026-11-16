import DataTable from './components/ui/DataTable';
import { PageTable } from './components/ui/PageSection';
import { PAGE_NAMES } from '../shared/pageNames';
import { headwayEvery, runTimeAmount } from '../shared/headwayText';
import { MISSING_VALUE } from '../shared/missingValue';
import { STUDIO_TARGET_HEADWAYS, type StudioVehicleGroup } from '../shared/studioVehicles';

/**
 * Atlas Studio's buses-needed figures (CIV-1693), now a sidebar panel on the Studio map (CIV-1731): the picked route's
 * group of routes that share buses (Kingston runs each direction as its own route, so one route alone overstates), at
 * the top bar's time of day. The numbers come from `scripts/vehicles-needed.ts --json`, served by the Vite dev server;
 * see shared/studioVehicles.ts. Every string here is proposed and waiting on Ryan's word-for-word OK.
 */

export const STUDIO_DEFAULT_AGENCY = 'kingston';

export const STUDIO_VEHICLES_TEXT = {
  routes: 'Routes',
  scheduled: 'Scheduled now',
  needed: 'Needed',
  neededAt: (hw: number) => `Needed ${headwayEvery(hw)}`,
  running: 'Running time',
  layover: 'Layover',
  noService: 'No buses at this time of day.',
} as const;

const T = STUDIO_VEHICLES_TEXT;

interface FigureRow { key: string; label: string; value: string | number }

/** One group's figures as rows: its routes, buses scheduled and needed, needed at each target, running time and layover. */
export function groupFigureRows(g: StudioVehicleGroup): FigureRow[] {
  return [
    { key: 'routes', label: T.routes, value: g.routes.join(', ') },
    { key: 'scheduled', label: T.scheduled, value: g.scheduled },
    { key: 'needed', label: T.needed, value: g.implied },
    ...STUDIO_TARGET_HEADWAYS.map(hw => ({ key: `at-${hw}`, label: T.neededAt(hw), value: g.atTarget[hw] ?? MISSING_VALUE })),
    { key: 'running', label: T.running, value: runTimeAmount(g.runningMin) },
    { key: 'layover', label: T.layover, value: runTimeAmount(g.layoverMin) },
  ];
}

/** The picked route's group as a two-column table; a time of day without its buses says so. */
export function StudioGroupFigures({ group, periodLabel }: { group: StudioVehicleGroup | null; /** The value column's header: the time of day. */ periodLabel: string }) {
  if (!group) return <p className="m-0 text-sm text-[var(--text-muted)]">{T.noService}</p>;
  return (
    <PageTable>
      <DataTable
        caption={PAGE_NAMES.studioVehicles}
        layout="fixed"
        rows={groupFigureRows(group)}
        rowKey={r => r.key}
        columns={[
          { key: 'label', header: '', rowHeader: true, width: 12, className: 'font-normal', cell: r => r.label },
          { key: 'value', header: periodLabel, cell: r => r.value },
        ]}
      />
    </PageTable>
  );
}
