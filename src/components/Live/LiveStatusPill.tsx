import { useEffect, useState } from 'react';
import { MAP_BADGE, MAP_BADGE_LABEL } from '../../styles';
import { LIVE_FEED_STATE_LABEL, liveRetryCountdown, livePositionsLastText } from '../../content/noticeCopy';
import { liveAgencyStatus, worstLiveStatus, type LiveAgencyFeed, type LiveStatus } from '../../../shared/liveStatus';
import { liveFiguresUpdatedText } from '../../../shared/liveWording';
import { clockTime } from '../../../shared/timeText';
import { useLiveFiguresUpdated } from '../../hooks/useLiveFiguresUpdated';

/** The dot's colour by state: the same status colours as the Live panel's own dot. */
const DOT: Record<LiveStatus, string> = {
  live: 'bg-[var(--status-positive)]',
  delayed: 'bg-[var(--status-caution)]',
  unavailable: 'bg-[var(--status-negative)]',
};

/** How often the pill re-reads its clock, so positions turn Delayed while no new poll arrives. */
const TICK_MS = 5_000;

const timeOf = (sec: number) => { const d = new Date(sec * 1000); return clockTime(d.getHours() * 60 + d.getMinutes()); };

/**
 * CIV-2084 (Ryan picked 1): Live's status in the map's bottom bar, in the "Data up to" pill's style, with a dot: Live,
 * Delayed or Unavailable, the worst among the agencies in view. Its hover says when each agency's positions last came in,
 * the retry countdown while the feeds are down, and when Live's figures were last built.
 */
export function LiveStatusPill({ feeds, retrySeconds = null }: { feeds: readonly LiveAgencyFeed[]; retrySeconds?: number | null }) {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const figures = useLiveFiguresUpdated(true);
  const status = worstLiveStatus(feeds.map(f => liveAgencyStatus(f, nowSec)));
  if (!status) return null;
  const title = [
    ...feeds.map(f => livePositionsLastText(f.name, f.newestSec == null ? null : timeOf(f.newestSec))),
    ...(retrySeconds != null ? [liveRetryCountdown(retrySeconds)] : []),
    ...(figures ? [liveFiguresUpdatedText(figures)] : []),
  ].join('\n');
  return (
    <div className={`${MAP_BADGE} h-8 max-sm:h-[32px]`} role="status" title={title}>
      <span className={`inline-flex h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} aria-hidden="true" />
      <span className={MAP_BADGE_LABEL}>{LIVE_FEED_STATE_LABEL[status]}</span>
    </div>
  );
}
