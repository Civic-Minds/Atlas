import { useEffect, useState } from 'react';
import { liveCloudNetworkCountUrl } from '../../../shared/liveCloud';
import { LIVE_COUNT_STEP_SEC } from '../../../shared/liveNetworkCount';
import { LIVE_POLL_SEC, LIVE_STALE_PACES } from '../../../shared/rules/live';

export interface NetworkCountBody { vehicles?: number; ageSec?: number }

/** The count to show from the reader's answer: null when there is none or it is older than two one-minute steps. */
export function networkCountFrom(body: NetworkCountBody | null): number | null {
  return body && typeof body.vehicles === 'number' && (body.ageSec ?? Infinity) <= LIVE_STALE_PACES * LIVE_COUNT_STEP_SEC ? body.vehicles : null;
}

/**
 * CIV-2182, CIV-2939: the agency's vehicles on the road right now across its whole network, from the cloud recorder's
 * latest count (atlas-live-read /live/network-count), for Fleet's "In service now". Null, so the row is left out, when the
 * agency has no count (not recorded, as Kingston answers) or the latest is older than two of its one-minute steps (Live's stale rule). Polled at Live's pace.
 */
export function useNetworkInService(slug: string, enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    setCount(null);
    if (!enabled) return;
    let cancelled = false;
    const read = async () => {
      try {
        const res = await fetch(liveCloudNetworkCountUrl(slug));
        const body = res.ok ? (await res.json()) as NetworkCountBody : null;
        if (!cancelled) setCount(networkCountFrom(body));
      } catch {
        if (!cancelled) setCount(null);
      }
    };
    void read();
    const id = setInterval(read, LIVE_POLL_SEC * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [slug, enabled]);
  return count;
}
