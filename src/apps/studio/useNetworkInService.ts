import { useEffect, useState } from 'react';
import { liveCloudNetworkCountUrl } from '../../../shared/liveCloud';
import { networkCountFrom, type NetworkCount, type NetworkCountBody } from '../../../shared/liveNetworkCount';
import { LIVE_POLL_SEC } from '../../../shared/rules/live';

export { networkCountFrom, type NetworkCount, type NetworkCountBody } from '../../../shared/liveNetworkCount';

/**
 * CIV-2182, CIV-2939: the agency's vehicles on the road right now across its whole network, from the cloud recorder's
 * latest count (atlas-live-read /live/network-count), for Fleet's "In service now" and "Not on a trip". Null, so the row is left out, when the
 * agency has no count (not recorded, as Kingston answers) or the latest is older than two of its one-minute steps (Live's stale rule). Polled at Live's pace.
 */
export function useNetworkInService(slug: string, enabled: boolean): NetworkCount | null {
  const [count, setCount] = useState<NetworkCount | null>(null);
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
