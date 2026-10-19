import type { ReactNode } from 'react';
import { dateRangeText, type LiveV3 } from '../../../../shared/liveDashboard';
import { TILE } from '../../../pageStyles';
import ProfileBars, { type ProfilePoint } from '../../charts/ProfileBars';
import Section from './Section';

/** The one derivation of the service-delivered figures (healthy days only), so every surface draws the same numbers. */
export function deliveredModel(v3: LiveV3, dir: number | null) {
  const sd = v3.serviceDelivered;
  if (!sd) return null;
  const overall = dir == null ? sd.overall : sd.overall.byDirection[String(dir)];
  const days = sd.byDay.filter(d => d.healthy);
  const skipped = sd.byDay.filter(d => !d.healthy);
  const points: ProfilePoint[] = days.map(d => ({ label: dateRangeText(d.date, d.date), y: dir == null ? d.share ?? 0 : d.byDirection[String(dir)] ?? 0, n: d.seen + d.notSeen }));
  return { overall, skipped, points };
}

/**
 * Service delivered: the share of scheduled trips that ran, by day, only on days with healthy recordings.
 * `full` is the Full analysis section (a sentence, the chart, a note on skipped days); `compact` is the Explore
 * section (a tile and the chart), which keeps its own section id and guards the content with `boundary`.
 */
export default function DeliveredSection({ v3, dir, detail, boundary }: { v3: LiveV3; dir: number | null; detail: 'full' | 'compact'; boundary?: string }): ReactNode {
  const full = detail === 'full';
  const m = deliveredModel(v3, dir);
  if (!m && full) return null;
  const frame = (children: ReactNode) => <Section id={full ? 'delivered' : 'x-delivered'} title="Service delivered" shrink={!full} boundary={boundary}>{children}</Section>;
  if (!m) return frame(null);
  const { overall, skipped, points } = m;
  const chart = (
    <ProfileBars
      ariaLabel="Share of scheduled trips that ran, day by day"
      points={points}
      formatY={y => `${Math.round(y * 1000) / 10}%`}
      unit="trips"
      valueHeader="Ran"
      rowHeader="Day"
      caption="How many of the scheduled trips ran, each day."
      scale={{ min: 0.9, max: 1 }}
    />
  );
  if (full) {
    return frame(<>
      {points.length > 1 && <div className="mt-4 max-w-2xl">{chart}</div>}
      <p className="mt-2 text-xs text-[var(--text-dim)]">Trips during gaps in our recordings aren't counted.{skipped.length > 0 && <> Not counted: {skipped.map(d => dateRangeText(d.date, d.date)).join(', ')} (gaps in our recordings).</>}</p>
    </>);
  }
  if (points.length < 2) return frame(null);
  return frame(
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      {overall?.share != null && (
        <div className={TILE}>
          <div className="text-xs font-bold text-[var(--text-muted)]">Ran</div>
          <div className="mt-1 text-3xl font-black tracking-tight">{Math.round(overall.share * 1000) / 10}%</div>
          <div className="mt-1 text-xs text-[var(--text-dim)]">{(overall.seen + overall.notSeen).toLocaleString()} trips</div>
        </div>
      )}
      {chart}
    </div>,
  );
}
