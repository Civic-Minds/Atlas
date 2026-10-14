import React from 'react';
import { SidebarCardSection } from '../cardUi';
import { useColorVision } from '../../../context/ColorVisionContext';
import { setSegmentBand, setSegmentView, useSegmentBand, useSegmentDelay, useSegmentView } from '../../../hooks/useSegmentDelay';
import {
  EWT_AMBER_SEC, SEGMENT_BAND_OPTIONS, directionLabel, ewtColor, formatMinutes, halfMinutes, halfMinutesDown, plural,
  rankSegments, segmentColor, tidyStopName, usableHeadways,
  type RankedHeadway, type RankedSegment, type SegmentDelayData,
} from '../../../utils/segmentDelayView';

function shortStop(name: string): string {
  // "King St West at Spadina Ave West Side" -> "Spadina Ave"
  const tidy = tidyStopName(name);
  const at = tidy.split(' at ');
  return (at[1] ?? at[0]).replace(/\s+(East|West|North|South) Side$/i, '').replace(/ - .*$/, '').trim();
}

function shortDate(d: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const Dot = ({ color }: { color: string }) => <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />;

function Chips<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`px-2 py-0.5 rounded-full text-xs font-bold border transition-colors ${
            value === o.id
              ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--bg-secondary)]'
              : 'border-[var(--border-primary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SegmentRow({ data, item, colorMode }: { data: SegmentDelayData; item: RankedSegment; colorMode: 'default' | 'friendly' }) {
  const { segment, stat, lostMin } = item;
  const p90 = halfMinutesDown(stat.gainedP90Sec);
  return (
    <div className="flex items-start gap-2">
      <Dot color={segmentColor(item, colorMode) ?? 'var(--text-dim)'} />
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--text-primary)] leading-snug">
          {shortStop(segment.fromName)} to {shortStop(segment.toName)}
          <span className="font-normal text-[var(--text-muted)]"> · {directionLabel(data, segment.directionId)}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] leading-snug">
          {lostMin > 0
            ? <>Takes {formatMinutes(lostMin)} longer than scheduled{p90 > lostMin ? <>; 1 in 10 take {formatMinutes(p90).replace(' min', '+ min')} longer</> : null}.</>
            : <>The schedule allows {formatMinutes(-lostMin)} more than vehicles need.</>}
          {' '}({plural(stat.trips, 'trip')}, {plural(stat.days, 'day')})
        </div>
      </div>
    </div>
  );
}

function HeadwayRow({ data, item, colorMode, showSchedule }: { data: SegmentDelayData; item: RankedHeadway; colorMode: 'default' | 'friendly'; showSchedule: boolean }) {
  const { stop, stat, ewtMin } = item;
  return (
    <div className="flex items-start gap-2">
      <Dot color={ewtColor(stat.excessWaitSec, colorMode) ?? 'var(--text-dim)'} />
      <div className="min-w-0">
        <div className="text-sm font-bold text-[var(--text-primary)] leading-snug">
          {shortStop(stop.stopName)}
          <span className="font-normal text-[var(--text-muted)]"> · {directionLabel(data, stop.directionId)}</span>
        </div>
        <div className="text-xs text-[var(--text-muted)] leading-snug">
          {showSchedule && <>Scheduled every {formatMinutes(halfMinutes(stat.scheduledMedianGapSec))}. </>}
          Riders wait {formatMinutes(ewtMin)} longer than the timetable implies; {Math.round(stat.withinShare * 100)}% of gaps are close to scheduled ({plural(stat.gaps, 'gap')}, {plural(stat.days, 'day')})
        </div>
      </div>
    </div>
  );
}

/** Route card section: where vehicles lose time, and where spacing breaks down (Live mode, local POC). */
export default function SegmentDelaySection({ slug, routeShortName }: { slug: string | null; routeShortName: string | null }) {
  const data = useSegmentDelay(slug, routeShortName);
  const band = useSegmentBand();
  const view = useSegmentView();
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  if (!data) return null;
  const range = `${shortDate(data.dates[0])} to ${shortDate(data.dates[data.dates.length - 1])}`;

  let body: React.ReactNode;
  if (view === 'time') {
    const { losing, gaining } = rankSegments(data, band);
    body = (
      <>
        {losing.length === 0
          ? <div className="text-xs text-[var(--text-muted)]">No stop pair runs ½ min or more over schedule in this period.</div>
          : losing.map(item => <SegmentRow key={`${item.segment.fromStopId}>${item.segment.toStopId}`} data={data} item={item} colorMode={colorMode} />)}
        {gaining.length > 0 && (
          <>
            <div className="text-xs font-bold text-[var(--text-dim)] pt-1">Where the schedule is looser than needed</div>
            {gaining.map(item => <SegmentRow key={`${item.segment.fromStopId}>${item.segment.toStopId}`} data={data} item={item} colorMode={colorMode} />)}
          </>
        )}
      </>
    );
  } else {
    const worst = usableHeadways(data, band).filter(h => h.stat.excessWaitSec! >= EWT_AMBER_SEC).sort((a, b) => b.stat.excessWaitSec! - a.stat.excessWaitSec!).slice(0, 5);
    body = worst.length === 0
      ? <div className="text-xs text-[var(--text-muted)]">Spacing stays close to schedule at every stop in this period.</div>
      : worst.map(item => <HeadwayRow key={`${item.stop.stopId}|${item.stop.directionId}`} data={data} item={item} colorMode={colorMode} showSchedule={band !== 'all'} />);
  }

  return (
    <SidebarCardSection label={`Where the ${routeShortName} falls behind`}>
      <Chips
        options={[{ id: 'time', label: 'Running time' }, { id: 'spacing', label: 'Spacing' }]}
        value={view}
        onChange={setSegmentView}
      />
      <Chips options={SEGMENT_BAND_OPTIONS} value={band} onChange={setSegmentBand} />
      {body}
      <div className="text-xs text-[var(--text-dim)] leading-snug pt-1">
        {view === 'time'
          ? 'Time between stops for every vehicle that passed, compared with the timetable for that time of day.'
          : 'Gaps between successive vehicles at each stop, compared with the timetable. Extra wait is the standard measure for frequent routes.'}
        {' '}Vehicle positions recorded about once a minute, {range}. Rounded to the nearest ½ min; stops with fewer than 30 samples are left out.
      </div>
    </SidebarCardSection>
  );
}
