import { useEffect, useState } from 'react';
import { FEATURES } from '../../shared/config';
import { LIVE_ANALYSIS_ROUTES } from '../../shared/livePollingConfig';
import { liveAgencyDataUrl } from '../lib/liveReportData';

/** The agencies with Live figures, from the one list of analysed routes ("ttc::504" → "ttc"). */
const LIVE_FIGURE_AGENCIES = [...new Set(LIVE_ANALYSIS_ROUTES.map(k => k.split('::')[0]))];

/**
 * When Live's figures were last built (CIV-1814 item 41): the newest agency summary's build time, for the About panel's
 * "Figures updated" line. Asks only while `enabled` (the panel is open) and Live reports are on; null until it knows.
 */
export function useLiveFiguresUpdated(enabled: boolean): string | null {
  const [iso, setIso] = useState<string | null>(null);
  const on = enabled && FEATURES.liveReports;
  useEffect(() => {
    if (!on) return;
    let live = true;
    void Promise.all(LIVE_FIGURE_AGENCIES.map(a => fetch(liveAgencyDataUrl(a))
      .then(r => (r.ok ? r.json() as Promise<{ status?: string; summary?: { generatedAt?: string } }> : null))
      .then(d => (d?.status === 'ready' ? d.summary?.generatedAt ?? null : null))
      .catch(() => null)))
      .then(times => {
        const newest = times.filter((t): t is string => !!t).sort().at(-1) ?? null;
        if (live) setIso(newest);
      });
    return () => { live = false; };
  }, [on]);
  return on ? iso : null;
}
