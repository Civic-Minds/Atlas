import type { ReactNode } from 'react';
import { dateRange } from '../../../../shared/dateText';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import Card from '../../ui/Card';
import ProfileBars, { type ProfilePoint } from '../../charts/ProfileBars';
import Section from './Section';
import LeftOutDays from '../LeftOutDays';
import { percentTenthText, countText } from '../../../../shared/numberText';

import { SERVICE_DELIVERED_TITLE } from '../../../../shared/liveWording';
import { DELIVERED_BY_DAY_LABEL } from '../../../content/noticeCopy';
/** The one derivation of the service-delivered figures (healthy days only), so every surface draws the same numbers. */
export function deliveredModel(v3: LiveV3, dir: number | null) {
  const sd = v3.serviceDelivered;
  if (!sd) return null;
  const overall = dir == null ? sd.overall : sd.overall.byDirection[String(dir)];
  const days = sd.byDay.filter(d => d.healthy);
  const skipped = sd.byDay.filter(d => !d.healthy);
  const points: ProfilePoint[] = days.map(d => ({ label: dateRange(d.date, d.date), y: dir == null ? d.share ?? 0 : d.byDirection[String(dir)] ?? 0, n: d.seen + d.notSeen }));
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
  const frame = (children: ReactNode) => <Section id={full ? 'delivered' : 'x-delivered'} title={SERVICE_DELIVERED_TITLE} shrink={!full} boundary={boundary}>{children}</Section>;
  if (!m) return frame(null);
  const { overall, skipped, points } = m;
  const chart = (
    <ProfileBars
      ariaLabel={DELIVERED_BY_DAY_LABEL}
      points={points}
      formatY={percentTenthText}
      unit="trips"
      valueHeader="Ran"
      rowHeader="Day"
      caption="How many of the scheduled trips ran, each day."
      scale={{ min: 0.9, max: 1 }}
      everyLabel
    />
  );
  if (full) {
    return frame(<>
      {points.length > 1 && <div className="mt-4 max-w-2xl">{chart}</div>}
      <p className="mt-2 text-xs text-[var(--text-dim)]">Trips during gaps in our recordings aren’t counted.{skipped.length > 0 && <> <LeftOutDays dates={skipped.map(d => d.date)} />.</>}</p>
    </>);
  }
  if (points.length < 2) return frame(null);
  return frame(
    <div className="mt-4 grid items-start gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
      {overall?.share != null && (
        <Card tone="surface" padding="tight" className="min-w-0">
          <div className="text-xs font-bold text-[var(--text-muted)]">Ran</div>
          <div className="mt-1 text-3xl font-black tracking-tight">{percentTenthText(overall.share)}</div>
          <div className="mt-1 text-xs text-[var(--text-dim)]">{countText(overall.seen + overall.notSeen)} trips</div>
        </Card>
      )}
      {chart}
    </div>,
  );
}
