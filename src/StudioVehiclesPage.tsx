import { useEffect, useState } from 'react';
import PageShell from './components/ui/PageShell';
import { PageTitle } from './components/ui/PageTitle';
import { PAGE_SECTION_NOTE, PageTable } from './components/ui/PageSection';
import PillGroup, { PILL_ROW } from './components/ui/PillGroup';
import DataTable, { PAGE_FIGURE_COLUMN_REM } from './components/ui/DataTable';
import { useLiveAgencyName } from './hooks/useLiveAgencyName';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../shared/config';
import { PAGE_NAMES, tabTitle } from '../shared/pageNames';
import { headwayEvery, runTimeAmount } from '../shared/headwayText';
import { MISSING_VALUE } from '../shared/missingValue';
import { STUDIO_TARGET_HEADWAYS, studioVehiclesDevUrl, type StudioTargetHeadway, type StudioVehicleGroup, type StudioVehiclesFile } from '../shared/studioVehicles';

/**
 * Atlas Studio's buses-needed calculator (CIV-1693), local only (FEATURES.studio). One row per group of routes that share
 * buses (Kingston runs each direction as its own route, so one route alone overstates). The numbers come from
 * `scripts/vehicles-needed.ts --json`, served by the Vite dev server; see shared/studioVehicles.ts.
 * Every string here is proposed and waiting on Ryan's word-for-word OK.
 */

export const STUDIO_DEFAULT_AGENCY = 'kingston';
const DEFAULT_PERIOD: PeriodKey = 'midday';
type Target = StudioTargetHeadway | 'schedule';

export const STUDIO_VEHICLES_TEXT = {
  intro: (agency: string) => `Buses each group of routes needs, from the ${agency} schedule. Routes that share buses are one group.`,
  periodLabel: 'Time of day',
  targetLabel: 'Target',
  asScheduled: 'As scheduled',
  routes: 'Routes',
  scheduled: 'Scheduled now',
  needed: 'Needed',
  neededAt: (hw: number) => `Needed ${headwayEvery(hw)}`,
  running: 'Running time',
  layover: 'Layover',
  noData: 'No data for this agency yet.',
  noService: 'No buses at this time of day.',
} as const;

const T = STUDIO_VEHICLES_TEXT;

/** The group table: one row per group, its member routes in the first column. */
export function StudioGroupTable({ groups, target }: { groups: readonly StudioVehicleGroup[]; target: Target }) {
  if (!groups.length) return <p className={PAGE_SECTION_NOTE}>{T.noService}</p>;
  return (
    <PageTable>
      <DataTable
        caption={PAGE_NAMES.studioVehicles}
        layout="page"
        rows={groups}
        rowKey={g => g.routes.join('+')}
        columns={[
          { key: 'routes', header: T.routes, rowHeader: true, className: 'font-normal', cell: g => g.routes.join(', ') },
          { key: 'scheduled', header: T.scheduled, width: PAGE_FIGURE_COLUMN_REM, cell: g => g.scheduled },
          { key: 'needed', header: T.needed, width: PAGE_FIGURE_COLUMN_REM, cell: g => g.implied },
          ...(target === 'schedule' ? [] : [{ key: 'target', header: T.neededAt(target), width: PAGE_FIGURE_COLUMN_REM + 2, cell: (g: StudioVehicleGroup) => g.atTarget[target] ?? MISSING_VALUE }]),
          { key: 'running', header: T.running, width: PAGE_FIGURE_COLUMN_REM, className: 'whitespace-nowrap', cell: g => runTimeAmount(g.runningMin) },
          { key: 'layover', header: T.layover, width: PAGE_FIGURE_COLUMN_REM, className: 'whitespace-nowrap', cell: g => runTimeAmount(g.layoverMin) },
        ]}
      />
    </PageTable>
  );
}

export default function StudioVehiclesPage() {
  // One demo agency for now (Kingston); a picker waits until Studio has more than one.
  const slug = STUDIO_DEFAULT_AGENCY;
  const agency = useLiveAgencyName(slug);
  const [file, setFile] = useState<StudioVehiclesFile | null | 'missing'>(null);
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);
  const [target, setTarget] = useState<Target>('schedule');

  useEffect(() => { document.title = tabTitle(PAGE_NAMES.studioVehicles, agency); }, [agency]);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<StudioVehiclesFile | 'missing'> => {
      try {
        const r = await fetch(studioVehiclesDevUrl(slug));
        return r.ok ? await r.json() as StudioVehiclesFile : 'missing';
      } catch { return 'missing'; }
    };
    void load().then(f => { if (live) setFile(f); });
    return () => { live = false; };
  }, [slug]);

  const periods = file && file !== 'missing' ? PERIOD_KEYS.filter(k => file.periods[k]?.length) : [];
  return (
    <PageShell>
      <div className="mt-10">
        <PageTitle>{PAGE_NAMES.studioVehicles}</PageTitle>
        {file === 'missing' && <p className={PAGE_SECTION_NOTE}>{T.noData}</p>}
        {file && file !== 'missing' && (
          <>
            <p className={PAGE_SECTION_NOTE}>{T.intro(agency)}</p>
            <div className={`mt-6 ${PILL_ROW}`}>
              <PillGroup label={T.periodLabel} options={periods.map(k => [k, PERIOD_LABELS[k]] as const)} value={period} onChange={setPeriod} />
              <PillGroup<Target> label={T.targetLabel} options={[['schedule', T.asScheduled], ...STUDIO_TARGET_HEADWAYS.map(hw => [hw, headwayEvery(hw)] as const)]} value={target} onChange={setTarget} />
            </div>
            <StudioGroupTable groups={file.periods[period] ?? []} target={target} />
          </>
        )}
      </div>
    </PageShell>
  );
}
