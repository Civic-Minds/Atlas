import { useEffect, useState } from 'react';
import { FIGURE_HEAD, FIGURE_ROW_HEAD, FIGURE_MAIN, FIGURE_ROW_LABEL, FigureFootnote, FigureNotes, FiguresCard } from '../../components/Live/FiguresCard';
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
  // CIV-2003: the week table's card and classes (FiguresCard), titled since its first column is the direction.
  return (
    <FiguresCard label={W.title} title={W.title}>
      <DataTable
        caption={W.title}
        rows={answer.directions}
        rowKey={d => d.direction}
        columns={[
          { key: 'direction', header: <span className={FIGURE_ROW_HEAD}>{T.columns.direction}</span>, rowHeader: true, className: `whitespace-nowrap ${FIGURE_ROW_LABEL}`, cell: d => d.direction },
          { key: 'vehicles', header: <span className={`${FIGURE_HEAD} whitespace-nowrap`}>{T.columns.vehicles}</span>, className: FIGURE_MAIN, cell: d => countText(d.vehiclesNow + d.standingNow) },
          { key: 'bunched', header: <span className={`${FIGURE_HEAD} whitespace-nowrap`}>{T.columns.bunched}</span>, className: FIGURE_MAIN, cell: d => countText(d.bunchedNow.length) },
          { key: 'gapped', header: <span className={`${FIGURE_HEAD} whitespace-nowrap`}>{T.columns.gapped}</span>, className: FIGURE_MAIN, cell: d => countText(d.gappedNow.length) },
        ]}
      />
      {lines.length > 0 && <FigureNotes lines={lines} tone="secondary" />}
      {answer.asOf != null && answer.dataAgeMin != null && <FigureFootnote>{W.reading(answer.asOf, answer.dataAgeMin)}</FigureFootnote>}
    </FiguresCard>
  );
}
