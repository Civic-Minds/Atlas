import { useEffect, useState } from 'react';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { STUDIO_NOW_PENDING as W, STUDIO_ROUTE_NOW_PENDING as T } from '../../../shared/liveWording';
import { countText } from '../../../shared/numberText';
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

/** The route's right-now answer, refreshed every minute; null while loading or where there is none. */
function useRouteNow(agency: string, route: string): Ready | null {
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
  // No reader here, or the agency isn't recorded every minute: leave the view out (the route's other figures stay).
  return answer == null || answer === 'none' || answer.live === null || !answer.directions ? null : answer as Ready;
}

/**
 * CIV-1828 (Ryan's pick, option A): Right now in the week table's look, one row per direction (the column says it's a
 * direction), moving and standing vehicles together, and how many stretches are bunched or have a long gap; under it the
 * closest pair and the longest wait, each "between X and Y". The definitions are in About (the week table's Learn more).
 */
export default function RouteNow({ agency, route }: { agency: string; route: string }) {
  const answer = useRouteNow(agency, route);
  if (!answer) return null;
  const closest = answer.directions.flatMap(d => d.bunchedNow).sort((a, b) => a.minutes - b.minutes)[0];
  const longest = answer.directions.flatMap(d => d.gappedNow).sort((a, b) => b.minutes - a.minutes)[0];
  const lines = [
    ...(closest ? [T.bunchedAt(betweenLabel(closest.fromStop, closest.toStop), closest.minutes)] : []),
    ...(longest ? [T.gappedAt(betweenLabel(longest.fromStop, longest.toStop), longest.minutes, longest.scheduledGapMin)] : []),
  ];
  const num = 'text-right text-sm font-black tracking-tight';
  const head = (s: string) => <span className="block whitespace-nowrap text-right font-normal text-[var(--text-dim)]">{s}</span>;
  return (
    <Card as="section" tone="surface" aria-label={W.title} className="min-w-0 px-2.5 py-1.5">
      <h3 className="m-0 pt-0.5 text-sm font-bold text-[var(--text-primary)]">{W.title}</h3>
      <DataTable
        caption={W.title}
        rows={answer.directions}
        rowKey={d => d.direction}
        columns={[
          { key: 'direction', header: <span className="font-normal text-[var(--text-dim)]">{T.columns.direction}</span>, rowHeader: true, className: 'whitespace-nowrap font-bold text-[var(--text-muted)]', cell: d => d.direction },
          { key: 'vehicles', header: head(T.columns.vehicles), className: num, cell: d => countText(d.vehiclesNow + d.standingNow) },
          { key: 'bunched', header: head(T.columns.bunched), className: num, cell: d => countText(d.bunchedNow.length) },
          { key: 'gapped', header: head(T.columns.gapped), className: num, cell: d => countText(d.gappedNow.length) },
        ]}
      />
      {lines.length > 0 && (
        <ul className="m-0 mt-1 list-none border-t border-[var(--border-primary)] p-0 pt-1">
          {lines.map(l => <li key={l} className="text-xs leading-4 text-[var(--text-secondary)]">{l}</li>)}
        </ul>
      )}
      {answer.asOf != null && answer.dataAgeMin != null && <p className="m-0 mt-0.5 text-xs leading-4 text-[var(--text-dim)] opacity-75">{W.reading(answer.asOf, answer.dataAgeMin)}</p>}
    </Card>
  );
}
