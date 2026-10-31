import type { ReactNode } from 'react';
import { buildupTakeaway, type DashboardBand, type DashboardBandData, type LiveV3, type UncertainStart } from '../../../../shared/liveDashboard';
import { isMajorStop, shortStopName, stretchEnds } from '../../../utils/stopLabel';
import ProfileBars, { sharedScale, type ProfilePoint } from '../../charts/ProfileBars';
import SortableDataTable from '../../ui/SortableDataTable';
import DirectionStrip from '../DirectionStrip';
import { branchNamesWrap } from '../BranchStrip';
import { branchStripFromV3 } from '../branchStripModel';
import PerPeriod, { PERIOD_BANDS_ONLY } from './PerPeriod';
import Section from './Section';
import { mins, pct } from './figures';

/** The one derivation of where delay builds up, so every surface draws the same numbers. */
export function buildupModel(data: DashboardBandData, dir: number | null, uncertain: UncertainStart[]) {
  const rows = data.buildup.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  // Stops at the start of a direction that are measured poorly (510 northbound under Union Station) are drawn as less exact.
  const lessExactStops = (d: number) => uncertain.find(u => u.directionId === d)?.stops ?? 0;
  const pointsOf = (b: (typeof rows)[number]): ProfilePoint[] => b.stretches.filter(s => s.n >= 10).map((s, i) => ({
    label: s.toName, short: shortStopName(s.toName), major: isMajorStop(s.toName), lessExact: i < lessExactStops(b.directionId) - 1,
    y: s.medianDelayMin, lo: s.p10DelayMin, hi: s.p90DelayMin, n: s.n,
  }));
  const scale = sharedScale(rows.map(pointsOf));
  return { rows, lessExactStops, pointsOf, scale };
}

/**
 * B3: where delays build up, one chart per direction on a shared scale. `full` is the Full analysis section (intro,
 * a sentence and takeaway, the answer for each time of day); `compact` is the Explore section, which keeps its own
 * section id and guards the content with `boundary`.
 */
export default function BuildupSection({ v3, data, dir, uncertain, detail, boundary, band = 'all' }: { v3: LiveV3; data: DashboardBandData; dir: number | null; uncertain: UncertainStart[]; detail: 'full' | 'compact'; boundary?: string; band?: DashboardBand }): ReactNode {
  const full = detail === 'full';
  // Full analysis draws the route strip at every width; on phones it is the strip's own compact vertical line (CIV-502).
  const { rows, lessExactStops, pointsOf, scale } = buildupModel(data, dir, uncertain);
  // Strips side by side share one top and one row height: the bracket room and two-line names are kept on both if either needs them.
  const models = full ? rows.map(b => branchStripFromV3(v3, b.directionId, band, uncertain)) : [];
  const reserveBracket = rows.some(b => b.kind === 'forms' && b.forms);
  const twoLineNames = models.some(m => m && branchNamesWrap(m));
  return (
    <Section id={full ? 'b3' : 'x-buildup'} title="Where delays build up" shrink={!full} boundary={boundary}>
      {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How late vehicles leave each stop along the route, and where that delay jumps and stays up.</p>}
      <div className={`mt-4 grid ${full ? 'gap-6' : 'gap-x-10 gap-y-8'} ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const points = pointsOf(b);
          const marked = b.forms ? points.findIndex(p => p.label === b.forms!.toName) : -1;
          // The five stretches that add the most; the Full analysis lists the top three (all five are in the Explore table).
          const worst = [...b.stretches].filter(s => s.n >= 30).sort((a, c) => c.medianAddedMin - a.medianAddedMin).slice(0, 5);
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              {full ? (
                // The route strip carries the delay at every stop and the marked stretch; the figures the old takeaway line gave are its hover text.
                <div className="mt-2" title={buildupTakeaway(b, lessExactStops(b.directionId))}>
                  <DirectionStrip v3={v3} directionId={b.directionId} band={band} uncertain={uncertain} modes={['delay']} reserveBracket={reserveBracket} twoLineNames={twoLineNames} />
                </div>
              ) : (
              <ProfileBars
                ariaLabel={`${label}: typical delay at each stop along the route.`}
                axisTitle="Minutes late"
                points={points}
                formatY={mins}
                unit="trips"
                valueHeader="Typical delay"
                caption="How late vehicles usually leave each stop: above the line is late, below is early."
                whiskers={false}
                zero
                zeroLabel="On time"
                scale={scale}
                lessExactNote="the first stops are in the tunnel, where we see the vehicles less often. These are rough."
                marks={marked >= 0 ? [{ index: marked, label: `Builds up by ${points[marked].short}` }] : []}
              />
              )}
              {full && (
                <PerPeriod
                  title="By time of day"
                  rows={PERIOD_BANDS_ONLY.flatMap(([k, name]) => {
                    const pb = v3.bands[k]?.buildup.find(x => x.directionId === b.directionId);
                    if (!pb) return [];
                    const text = pb.kind === 'forms' && pb.forms ? `builds up by ${shortStopName(pb.forms.toName)} (${mins(pb.forms.medianAddedMin)})` : pb.kind === 'gradual' ? 'builds slowly, no single stretch' : pb.kind === 'none' ? 'stays about level' : 'too few trips';
                    return [{ key: k, label: name, text }];
                  })}
                />
              )}
              <div className="mt-3 sm:overflow-x-auto">
                <SortableDataTable
                  narrowFit
                  caption={`${label}: the stretches that add the most delay`}
                  defaultSort="added"
                  rows={full ? worst.slice(0, 3) : worst}
                  rowKey={s => `${s.fromStopId}-${s.toStopId}`}
                  columns={full ? [
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, width: 14, className: 'font-normal break-words', cell: s => { const [a, b] = stretchEnds(s.fromName, s.toName); return <span title={`${s.fromName} to ${s.toName}`}>{a} to {b}</span>; } },
                    { key: 'added', header: 'Typical added', width: 7, className: 'max-sm:!pr-1', worst: s => s.medianAddedMin, cell: s => mins(s.medianAddedMin) },
                    { key: 'grows', header: 'Trips where it grows', width: 10, className: 'whitespace-nowrap max-sm:!pr-1.5', worst: s => s.growShare, cell: s => `${pct(s.growShare)} of ${s.n.toLocaleString()}` },
                  ] : [
                    { key: 'stretch', header: 'Stretch that adds the most', rowHeader: true, className: 'font-normal', cell: s => `${s.fromName} to ${s.toName}` },
                    { key: 'added', header: 'Typical added', worst: s => s.medianAddedMin, cell: s => mins(s.medianAddedMin) },
                    { key: 'grows', header: 'Trips where it grows', worst: s => s.growShare, cell: s => `${pct(s.growShare)} of ${s.n.toLocaleString()}` },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
