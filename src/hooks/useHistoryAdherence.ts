import { useEffect, useState } from 'react';
import type { HistoryAdherenceResult } from '../../shared/computeHistoryAdherence';

export type HistoryStatus = 'idle' | 'loading' | 'noData' | 'error' | 'ready';

export function useHistoryAdherence(
  agency: string | null,
  routeShortName: string | null,
  days = 7,
): { data: HistoryAdherenceResult | null; status: HistoryStatus } {
  const [data, setData] = useState<HistoryAdherenceResult | null>(null);
  const [status, setStatus] = useState<HistoryStatus>('idle');

  useEffect(() => {
    if (!agency || !routeShortName) {
      setData(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    // Don't clear data — keep previous visible while new loads

    fetch(`/api/history-adherence?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(routeShortName)}&days=${days}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (json?.noData || json?.error) {
          setStatus(json.noData ? 'noData' : 'error');
        } else {
          setData(json);
          setStatus('ready');
        }
      })
      .catch(() => { if (!cancelled) setStatus('error'); });

    return () => { cancelled = true; };
  }, [agency, routeShortName, days]);

  return { data, status };
}
