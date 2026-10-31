import type { ReactNode } from 'react';
import { type DashboardBand, type LiveV3 } from '../../../../shared/liveDashboard';
import { isMajorStop, shortStopName } from '../../../utils/stopLabel';
import ProfileBars, { sharedScale, type ProfilePoint } from '../../charts/ProfileBars';
import SortableDataTable from '../../ui/SortableDataTable';
import Section from './Section';
import { headwayExactAmount } from '../../../utils/headwayText';
import { dirsOf, num } from './figures';

/** The one derivation of the extra-wait figures, so every surface draws the same numbers. */
export function extraWaitModel(v3: LiveV3, band: DashboardBand, dir: number | null) {
  const all = v3.extraWait?.[band];
  if (!all) return null;
  const dirs = dirsOf(v3, dir);
  const pointsOf = (d: number): ProfilePoint[] => all.filter(s => s.directionId === d).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: Math.max(0, s.extraWaitMin), n: s.gaps }));
  const scale = sharedScale(dirs.map(pointsOf));
  const worst = all.filter(s => (dir == null || s.directionId === dir) && s.gaps >= 30).sort((a, b) => b.extraWaitMin - a.extraWaitMin).slice(0, 10);
  return { all, dirs, pointsOf, scale, worst };
}

const EMPTY = 'No stop on this route has a vehicle every 15 minutes or better in this time of day.';

/**
 * Extra wait: how much longer riders wait than scheduled, at stops with service every 15 minutes or better.
 * `full` is the Full analysis section (intro, a sentence per direction); `compact` is the Explore section, which
 * keeps its own section id, narrows inside its grid and guards the content with `boundary`.
 */
export default function ExtraWaitSection({ v3, band, dir, detail, boundary }: { v3: LiveV3; band: DashboardBand; dir: number | null; detail: 'full' | 'compact'; boundary?: string }): ReactNode {
  const full = detail === 'full';
  const m = extraWaitModel(v3, band, dir);
  if (!m && full) return null;
  const frame = (children: ReactNode) => <Section id={full ? 'wait' : 'x-wait'} title="Extra wait" shrink={!full} boundary={boundary}>{children}</Section>;
  if (!m) return frame(null);
  const { all, dirs, pointsOf, scale } = m;
  // The Full analysis lists the five longest waits (the rest are in the chart's hover text); Explore lists ten.
  const worst = full ? m.worst.slice(0, 5) : m.worst;
  const points0 = Math.max(0, ...dirs.map(d => pointsOf(d).length));
  if (all.length === 0) {
    return frame(<>
      {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How much longer riders wait than scheduled, where a vehicle is due every 15 minutes or better.</p>}
      <p className="mt-3 text-sm text-[var(--text-muted)]">{EMPTY}</p>
    </>);
  }
  return frame(<>
    {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How much longer riders wait than scheduled, where a vehicle is due every 15 minutes or better.</p>}
    <div className={`mt-4 grid ${full ? 'gap-6' : 'gap-x-10 gap-y-8'} ${dirs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
      {dirs.map(d => {
        const label = v3.directionLabels[String(d)];
        const points = pointsOf(d);
        return (
          <div key={d} className="min-w-0">
            <h3 className="text-base font-black">{label}</h3>
            {points.length > 1 && (
              <ProfileBars
                ariaLabel={`${label}: extra wait at each stop along the route.`}
                points={points}
                formatY={y => `${num(y)} min`}
                unit="gaps"
                valueHeader="Extra wait"
                caption={full ? undefined : 'How much longer riders wait than the timetable says, at each stop.'}
                fadedNote={!full}
                peakLabel={full}
                axisTitle="Extra minutes"
                scale={scale}
              />
            )}
          </div>
        );
      })}
    </div>
    {full && points0 > 1 && <p className="mt-2 text-xs text-[var(--text-dim)]">Paler bars rest on fewer than 30 gaps.</p>}
    {worst.length > 0 && (
      <div className="mt-5 sm:overflow-x-auto">
        <SortableDataTable
          narrowFit
          rowTitle={s => `${s.name}: ${s.gaps.toLocaleString()} gaps`}
          caption="Stops where riders wait longest compared with the timetable"
          defaultSort="extra"
          rows={worst}
          rowKey={s => `${s.stopId}-${s.directionId}`}
          columns={[
            { key: 'stop', header: 'Stop', rowHeader: true, className: full ? 'font-normal break-words' : 'font-normal', cell: s => (full ? <span title={s.name}>{s.name}</span> : s.name) },
            ...(dir == null ? [{ key: 'dir', header: 'Direction', cell: (s: (typeof worst)[number]) => v3.directionLabels[String(s.directionId)] }] : []),
            { key: 'extra', header: 'Extra wait', worst: s => s.extraWaitMin, cell: s => `${num(s.extraWaitMin)} min` },
            { key: 'sched', header: 'Scheduled every', narrowHide: true, cell: s => headwayExactAmount(s.scheduledGapMin) },
            { key: 'n', header: 'Gaps', narrowHide: true, cell: s => s.gaps.toLocaleString() },
          ]}
        />
      </div>
    )}
  </>);
}
