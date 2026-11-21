import { useEffect, useState, type ReactNode } from 'react';
import { FigureFootnote } from '../../components/Live/FiguresCard';
import { PanelSection } from '../../components/Live/panelSections';
import { STUDIO_NOW_PENDING as W, STUDIO_ROUTE_NOW_PENDING as T, STUDIO_ROUTE_PANEL_PENDING as P } from '../../../shared/liveWording';
import { betweenLabel } from '../../utils/stopLabel';

/**
 * CIV-1893: a route right now, in Studio's Live route view. The numbers are the MCP's route_now answer (the dev API runs
 * the same code, shared/liveNow.ts): the time of the reading and its age, where vehicles are bunched, where riders have
 * waited longest. Only agencies the recorder reads every minute have it.
 */
interface Stretch { fromStop: string; toStop: string; stops: number; minutes: number; minAgo?: number; scheduledGapMin: number | null }
interface Direction { direction: string; vehiclesNow: number; standingNow: number; bunchedNow: Stretch[]; gappedNow: Stretch[] }
interface Answer { asOf?: string; dataAgeMin?: number; live?: null; directions?: Direction[] }
type Ready = Answer & { directions: Direction[] };
const REFRESH_MS = 60_000;

export const ROUTE_NOW_URL = '/api/route-now';

/** The route's right-now answer, refreshed every minute: 'loading', 'none' where there is no live reading, or the answer. */
function useRouteNow(agency: string, route: string): Ready | 'loading' | 'none' {
  const [answer, setAnswer] = useState<Answer | null | 'none'>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch(`${ROUTE_NOW_URL}?agency=${encodeURIComponent(agency)}&route=${encodeURIComponent(route)}`)
      .then(r => r.json() as Promise<{ available?: boolean; answer?: Answer; error?: string }>)
      .then(j => { if (!cancelled) setAnswer(j.available && j.answer ? j.answer : 'none'); })
      .catch(() => { if (!cancelled) setAnswer('none'); });
    setAnswer(null);
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [agency, route]);
  if (answer == null) return 'loading';
  return answer === 'none' || answer.live === null || !answer.directions ? 'none' : answer as Ready;
}

/** One direction's row: its name, which wraps to the panel's width, and its figure at the end (CIV-2021: no sideways scroll). */
function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="min-w-0 font-bold text-[var(--text-muted)]">{name}</span>
      <span className="shrink-0 text-right font-black tracking-tight text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

/**
 * CIV-2021 (Ryan: "a spot in this card for service right this second, then a section for gapping right now"): two
 * sections of the route panel, each headed like every other section. Service now: the vehicles on the road in each
 * direction and the reading's time. Gaps and bunching now: each direction's bunched pairs and long gaps, then the closest
 * pair and the longest wait, each "between X and Y". With no live reading the first section says so plainly.
 */
export default function RouteNow({ agency, route }: { agency: string; route: string }) {
  const answer = useRouteNow(agency, route);
  if (answer === 'loading') return null;
  // No reading, or no vehicle on the road: both sections stay, each saying so (CIV-2021: never a section that vanishes).
  const plain = (text: string, foot?: ReactNode) => (
    <>
      <PanelSection label={P.serviceTitle}><p className="m-0 text-sm text-[var(--text-secondary)]">{text}</p>{foot}</PanelSection>
      <PanelSection label={P.gapsTitle}><p className="m-0 text-sm text-[var(--text-secondary)]">{text}</p></PanelSection>
    </>
  );
  if (answer === 'none') return plain(P.noReading);
  const reading = answer.asOf != null && answer.dataAgeMin != null ? <FigureFootnote>{W.reading(answer.asOf, answer.dataAgeMin)}</FigureFootnote> : null;
  if (answer.directions.length === 0) return plain(P.noVehicles, reading);
  const closest = answer.directions.flatMap(d => d.bunchedNow).sort((a, b) => a.minutes - b.minutes)[0];
  const longest = answer.directions.flatMap(d => d.gappedNow).sort((a, b) => b.minutes - a.minutes)[0];
  const lines = [
    ...(closest ? [T.bunchedAt(betweenLabel(closest.fromStop, closest.toStop), closest.minutes)] : []),
    ...(longest ? [T.gappedAt(betweenLabel(longest.fromStop, longest.toStop), longest.minutes, longest.scheduledGapMin)] : []),
  ];
  return (
    <>
      <PanelSection label={P.serviceTitle}>
        {answer.directions.map(d => <Row key={d.direction} name={d.direction} value={P.vehicles(d.vehiclesNow + d.standingNow)} />)}
        {reading}
      </PanelSection>
      <PanelSection label={P.gapsTitle}>
        {answer.directions.map(d => <Row key={d.direction} name={d.direction} value={P.gaps(d.bunchedNow.length, d.gappedNow.length)} />)}
        {lines.length > 0 && <ul className="m-0 mt-1 list-none space-y-1 p-0">{lines.map(l => <li key={l} className="text-xs leading-4 text-[var(--text-secondary)] text-pretty">{l}</li>)}</ul>}
      </PanelSection>
    </>
  );
}
