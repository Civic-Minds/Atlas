/**
 * CIV-1828: Studio's Live page body, inside Studio's shell (the shell owns the page menu, the agency menu, ?agency= and
 * the route; this owns its measure, direction, time of day and the picked stop or stretch). It portals its route menu,
 * measure pills, direction pill, data date and time-of-day menu into the slots the shell gives it. It is the Live tool's
 * own body (LiveToolPage's Body), leading with "Falls behind": where vehicles fall behind the schedule, stop to stop.
 */
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Body, PeriodMenu, STUDIO_MAP_MEASURES } from '../../LiveToolPage';
import { useLiveAgency } from '../../LiveAgencyPage';
import { useLiveAgencyName } from '../../hooks/useLiveAgencyName';
import { useAgencies } from '../../hooks/useAgencies';
import { liveBandNow } from './liveBandNow';
import { loadingText } from '../../content/noticeCopy';
import type { DashboardBand } from '../../../shared/liveDashboard';
import type { MapMeasure } from './routeMapModel';
import type { MapPick } from '../MapApp';

export interface StudioLiveSlots { route: HTMLElement | null; measure: HTMLElement | null; direction: HTMLElement | null; data: HTMLElement | null }
export interface StudioLiveBodyProps { agency: string; route: string | null; setRoute: (r: string | null) => void; slots: StudioLiveSlots }

export default function StudioLiveBody({ agency, route, setRoute, slots }: StudioLiveBodyProps) {
  const agencyName = useLiveAgencyName(agency);
  const state = useLiveAgency(agency);
  const { agencies } = useAgencies();
  const [band, setBand] = useState<DashboardBand>(() => liveBandNow(agencies.find(a => a.slug === agency)?.timezone));
  const [measure, setMeasure] = useState<MapMeasure>('fallsBehind');
  const [dir, setDir] = useState<number | null>(null);
  const [pick, setPick] = useState<MapPick | null>(null);
  const line = (text: ReactNode, busy = false) => <p className="p-6 text-sm text-[var(--text-muted)]" aria-busy={busy || undefined}>{text}</p>;
  if (state.kind === 'loading') return line(loadingText(agencyName), true);
  if (state.kind === 'error') return line(state.reason);
  if (state.data.status !== 'ready') return line(state.data.reason);
  const pickRoute = (r: string | null) => { setRoute(r); if (!r) setDir(null); };
  return (
    <>
      {slots.data && createPortal(<PeriodMenu band={band} setBand={setBand} />, slots.data)}
      <Body
        agency={agency} agencyName={agencyName} s={state.data.summary}
        pickSlot={slots.route} measureSlot={slots.measure} dirSlot={slots.direction} dataSlot={slots.data}
        route={route} setRoute={pickRoute} dir={dir} setDir={setDir} band={band}
        measure={measure} setMeasure={setMeasure} pick={pick} setPick={setPick} measures={STUDIO_MAP_MEASURES}
      />
    </>
  );
}
