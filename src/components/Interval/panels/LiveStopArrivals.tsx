import React, { useState, useEffect } from 'react';
import { isLiveEligibleSlug } from '../../../../shared/livePollingConfig';
import { SidebarCardSection } from '../cardUi';
import { cleanRouteShortName } from '../../../utils/format';

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
  const eligible = isLiveEligibleSlug(slug);

  useEffect(() => {
    if (!eligible) return;
    setData(null);
    let cancelled = false;
    const load = () =>
      fetch(`/api/live-stop?agency=${encodeURIComponent(slug)}&stop=${encodeURIComponent(stopId)}&lat=${lat}&lon=${lon}`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (!cancelled && d) setData(d); })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, stopId, lat, lon, eligible]);

  const hasPredicted = (data?.arrivals.length ?? 0) > 0;
  const hasMeasured = (data?.measuredArrivals?.length ?? 0) > 0;
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
    <SidebarCardSection label="Live at this stop">
      <div className="px-1 pb-1">
        {hasPredicted && (
          <div className="flex flex-wrap gap-1.5">
            {next.map((a, i) => (
              <span
                key={i}
                className="text-[10px] font-bold text-[var(--text-primary)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
              >
                {a.route} · {a.min === 0 ? 'now' : `${a.min} min`}
              </span>
            ))}
          </div>
        )}
        {data.observedGapMin != null && (
          <p className="text-[10px] text-[var(--text-dim)] mt-2">
            Coming every ~{Math.round(data.observedGapMin)} min right now
          </p>
        )}
        {hasMeasured && (
          <div className={hasPredicted ? 'mt-2.5 pt-2.5 border-t border-[var(--border-primary)]' : ''}>
            <p className="text-[9px] font-bold text-[var(--text-dim)]">Recently seen here</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {recentlySeen.map((a, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-2.5 py-1"
                >
                  {a.route} · {a.minAgo === 0 ? 'just now' : `${a.minAgo} min ago`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidebarCardSection>
  );
}
