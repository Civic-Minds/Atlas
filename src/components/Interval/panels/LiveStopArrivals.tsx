import { useState, useEffect } from 'react';
import { isLiveEligibleSlug } from '../../../../shared/livePollingConfig';
import { FEATURES } from '../../../../shared/config';
import { SidebarCardSection } from '../cardUi';
import { cleanRouteShortName } from '../../../utils/format';
import { delayAmount, headwayAbout } from '../../../utils/headwayText';
import { LIVE_AT_STOP_LABEL, LIVE_STOP_ARRIVALS_UNAVAILABLE, RECENTLY_SEEN_HERE } from '../../../content/noticeCopy';
import PanelEmpty from '../../ui/PanelEmpty';

const POLL_MS = 20_000;

interface LiveStopData {
  now: number;
  arrivals: { route: string; epoch: number }[];
  observedGapMin: number | null;
  measuredArrivals?: { route: string; epoch: number }[];
}

/** Live next-arrivals section for the stop card ("504 in 3 min · every ~7 min right now"). */
export default function LiveStopArrivals({ slug, stopId, lat, lon }: { slug: string; stopId: string; lat: number; lon: number }) {
  const [data, setData] = useState<LiveStopData | null>(null);
  // The request failed and nothing has loaded yet: say so instead of leaving the section out (CIV-959 gap 13).
  const [failed, setFailed] = useState(false);
  const eligible = FEATURES.live && isLiveEligibleSlug(slug);

  useEffect(() => {
    if (!eligible) return;
    setData(null);
    setFailed(false);
    let cancelled = false;
    const load = () =>
      fetch(`/api/live-stop?agency=${encodeURIComponent(slug)}&stop=${encodeURIComponent(stopId)}&lat=${lat}&lon=${lon}`)
        .then(r => {
          if (!r.ok) throw new Error(`live-stop ${r.status}`);
          return r.json() as Promise<LiveStopData>;
        })
        .then(d => { if (!cancelled) { setData(d); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); });
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, stopId, lat, lon, eligible]);

  const hasPredicted = (data?.arrivals.length ?? 0) > 0;
  const hasMeasured = (data?.measuredArrivals?.length ?? 0) > 0;
  if (eligible && !data && failed) {
    return (
      <SidebarCardSection label={LIVE_AT_STOP_LABEL}>
        <PanelEmpty>{LIVE_STOP_ARRIVALS_UNAVAILABLE}</PanelEmpty>
      </SidebarCardSection>
    );
  }
  if (!eligible || !data || (!hasPredicted && !hasMeasured)) return null;

  const nowSec = data.now;
  const next = data.arrivals.slice(0, 3).map(a => {
    const min = Math.max(0, Math.round((a.epoch - nowSec) / 60));
    return { route: cleanRouteShortName(a.route), min };
  });
  // "Just now" reads oddly for something 4 minutes ago — round to the nearest
  // minute and only claim "just now" inside the first 60 seconds.
  const recentlySeen = (data.measuredArrivals ?? []).slice(0, 3).map(a => {
    const minAgo = Math.max(0, Math.round((nowSec - a.epoch) / 60));
    return { route: cleanRouteShortName(a.route), minAgo };
  });

  return (
    <SidebarCardSection label={LIVE_AT_STOP_LABEL}>
      <div className="px-1 pb-1">
        {hasPredicted && (
          <div className="flex flex-wrap gap-1.5">
            {next.map((a, i) => (
              <span
                key={i}
                className="text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
              >
                {a.route} · {a.min === 0 ? 'now' : delayAmount(a.min)}
              </span>
            ))}
          </div>
        )}
        {data.observedGapMin != null && (
          <p className="text-xs text-[var(--text-dim)] mt-2">
            Coming {headwayAbout(Math.round(data.observedGapMin))} right now
          </p>
        )}
        {hasMeasured && (
          <div className={hasPredicted ? 'mt-2.5 pt-2.5 border-t border-[var(--border-primary)]' : ''}>
            <p className="text-xs font-bold text-[var(--text-dim)]">{RECENTLY_SEEN_HERE}</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {recentlySeen.map((a, i) => (
                <span
                  key={i}
                  className="text-xs font-bold text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
                >
                  {a.route} · {a.minAgo === 0 ? 'just now' : `${delayAmount(a.minAgo)} ago`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidebarCardSection>
  );
}
