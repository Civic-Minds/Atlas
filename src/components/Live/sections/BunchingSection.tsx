import { useState, type ReactNode } from 'react';
import { LINK_LABELS, bunchingSentence, linkValueText, type DashboardBand, type DashboardBunchingBand, type LiveV3, type UncertainStart } from '../../../../shared/liveDashboard';
import type { LiveGaps, StopGaps } from '../../../hooks/useLiveGaps';
import { isMajorStop, shortStopName } from '../../../utils/stopLabel';
import GapsChart from '../../charts/GapsChart';
import ProfileBars, { sharedScale, type ProfilePoint } from '../../charts/ProfileBars';
import { useMediaQuery } from '../../../hooks/useMediaQuery';
import DirectionStrip from '../DirectionStrip';
import { branchNamesWrap } from '../BranchStrip';
import { branchStripFromV3 } from '../branchStripModel';
import PerPeriod, { PERIOD_BANDS_ONLY } from './PerPeriod';
import Section from './Section';
import { pct } from './figures';
import Tag from '../../ui/Tag';

/** The one derivation of where bunching forms, so every surface draws the same numbers. */
export function bunchingModel(v3: LiveV3, dir: number | null, band: DashboardBand) {
  const rows = v3.bunching.filter(b => dir == null || b.directionId === dir).sort((a, b) => a.directionId - b.directionId);
  const pointsOf = (data: DashboardBunchingBand): ProfilePoint[] => data.stops.filter(s => s.n >= 10).map(s => ({ label: s.name, short: shortStopName(s.name), major: isMajorStop(s.name), y: s.bunchedShare, y2: s.gappedShare, n: s.n }));
  const scale = sharedScale(rows.flatMap(b => (b.bands[band] ? [pointsOf(b.bands[band])] : [])));
  return { rows, pointsOf, scale };
}

/** Gaps through the day at one stop of one direction: where bunching forms by default, any measured stop on request. */
function GapsBlock({ data, gaps, label }: { data: DashboardBunchingBand; gaps: Record<string, StopGaps> | undefined; label: string }) {
  const options = data.stops.filter(s => s.n >= 30 && gaps?.[s.stopId]);
  const preferred = [data.forms?.toStopId, data.biggestRise?.toStopId].find(id => id && options.some(o => o.stopId === id))
    ?? [...options].sort((a, b) => b.badShare - a.badShare)[0]?.stopId;
  const [picked, setPicked] = useState<string | null>(null);
  const stopId = picked ?? preferred;
  const stop = options.find(o => o.stopId === stopId);
  if (!gaps || !stop) return null;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-black">Gaps through the day</h4>
        <label className="text-xs text-[var(--text-muted)]">
          <span className="sr-only">Stop</span>
          <select value={stop.stopId} onChange={e => setPicked(e.target.value)} className="h-6 max-w-[16rem] rounded-md border border-[var(--border-primary)] bg-[var(--bg-app)] px-1.5 text-xs text-[var(--text-secondary)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            {options.map(o => <option key={o.stopId} value={o.stopId}>{o.name}</option>)}
          </select>
        </label>
      </div>
      <GapsChart gaps={gaps[stop.stopId]} ariaLabel={`${label}: every gap between cars at ${stop.name} through the day, against the timetable.`} />
    </div>
  );
}

/**
 * B4: where and why bunching forms. "Linked to", never "caused by". `full` is the Full analysis section (intro, a
 * sentence per direction, the gaps chart with its stop picker, what it is linked to, the answer for each time of
 * day); `compact` is the Explore section (the chart only), which keeps its own section id and guards the content
 * with `boundary`. `gaps` is only used by `full`.
 */
export default function BunchingSection({ v3, dir, band, gaps, detail, boundary, uncertain = [] }: { v3: LiveV3; dir: number | null; band: DashboardBand; gaps?: LiveGaps | null; detail: 'full' | 'compact'; boundary?: string; uncertain?: UncertainStart[] }): ReactNode {
  const full = detail === 'full';
  // On a phone the strip would be a long vertical list of every stop: the bar chart stays there.
  const phone = useMediaQuery('(max-width: 479px)');
  const { rows, pointsOf, scale } = bunchingModel(v3, dir, band);
  const models = full ? rows.map(b => branchStripFromV3(v3, b.directionId, band, uncertain)) : [];
  const reserveBracket = rows.some(b => b.bands[band]?.kind === 'forms' && b.bands[band]?.forms);
  const twoLineNames = models.some(m => m && branchNamesWrap(m));
  return (
    <Section id={full ? 'b4' : 'x-bunching'} title="Where bunching forms" shrink={!full} boundary={boundary}>
      {full && <p className="mt-2 text-sm text-[var(--text-muted)]">How often vehicles come too close together or too far apart, stop by stop, and where that starts.</p>}
      <div className={`mt-4 grid ${full ? 'gap-6' : 'gap-x-10 gap-y-8'} ${rows.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {rows.map(b => {
          const label = v3.directionLabels[String(b.directionId)];
          const data: DashboardBunchingBand | undefined = b.bands[band];
          if (!data) return null;
          const points = pointsOf(data);
          // The marked stretch: where bunching forms. Full analysis marks nothing when no single stretch steps up (the strip, the phone chart and the sentence all follow `kind`); Explore also shows the biggest rise.
          const stretch = full ? (data.kind === 'forms' ? data.forms : null) : data.forms ?? data.biggestRise;
          const markIdx = stretch ? points.findIndex(p => p.label === data.stops.find(s => s.stopId === stretch.toStopId)?.name) : -1;
          const linked = stretch?.links.filter(l => l.linked) ?? [];
          return (
            <div key={b.directionId} className="min-w-0">
              <h3 className="text-base font-black">{label}</h3>
              {full && !phone && <DirectionStrip className="mt-2" v3={v3} directionId={b.directionId} band={band} uncertain={uncertain} modes={['bunching']} reserveBracket={reserveBracket} twoLineNames={twoLineNames} />}
              {(!full || phone) && points.length > 1 && (
                <ProfileBars
                  ariaLabel={`${label}: share of gaps that are too close together or too far apart, stop by stop.`}
                  points={points}
                  formatY={y => pct(y)}
                  unit="gaps"
                  valueHeader="Gaps off the timetable"
                  caption="How often vehicles arrive too close together or too far apart, at each stop."
                  axisTitle="Share of gaps"
                  scale={scale}
                  series={[{ name: 'Too close together', color: 'var(--strip-bunching-2)' }, { name: 'Too far apart', color: 'var(--strip-bunching-1)' }]}
                  marks={markIdx >= 0 ? [{ index: markIdx, label: data.kind === 'forms' ? 'Forms here' : 'Biggest rise' }] : []}
                />
              )}
              {full && stretch && <p className="mt-2 text-sm leading-6">{bunchingSentence(label, data)}</p>}
              {full && <GapsBlock data={data} gaps={gaps?.directions[String(b.directionId)]} label={label} />}
              {full && stretch && (
                <>
                  <h4 className="mt-3 text-sm font-black">{linked.length ? 'Linked to' : 'Nothing measured here is linked to it'}</h4>
                  <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-1.5 p-0">
                    {stretch.links.map(l => (
                      <li key={l.kind}>
                        <Tag tone={l.linked ? 'accent' : 'quiet'} size="sm" className={l.linked ? 'text-xs' : 'font-normal text-[var(--text-dim)]'}>
                          {LINK_LABELS[l.kind]}: {l.value == null ? 'Not measured' : l.linked ? 'Linked' : 'Not linked'} ({linkValueText(l.kind, l.value)})
                        </Tag>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {full && (
                <PerPeriod
                  title="By time of day"
                  rows={PERIOD_BANDS_ONLY.flatMap(([k, name]) => {
                    const pb = b.bands[k];
                    if (!pb || pb.kind == null) return [];
                    const text = pb.kind === 'forms' && pb.forms ? `forms by ${shortStopName(pb.forms.toName)}` : pb.kind === 'gradual' ? 'builds slowly, no single stretch' : 'stays close to the timetable';
                    return [{ key: k, label: name, text }];
                  })}
                />
              )}
            </div>
          );
        })}
      </div>
      {full && rows.some(b => b.bands[band]?.kind === 'forms' && b.bands[band]?.forms) && <p className="mt-3 text-xs text-[var(--text-dim)]">Linked means it was measured in this stretch, not that it is the cause.</p>}
    </Section>
  );
}
