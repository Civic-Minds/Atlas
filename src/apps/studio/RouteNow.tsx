import { useEffect, useState } from 'react';
import Widget from '../../components/Live/tool/Widget';
import Card from '../../components/ui/Card';
import DataTable from '../../components/ui/DataTable';
import { STUDIO_NOW_PENDING as W, STUDIO_ROUTE_NOW_PENDING as T } from '../../../shared/liveWording';
import { countText } from '../../../shared/numberText';
import { betweenLabel, stretchLabel } from '../../utils/stopLabel';

/**
 * CIV-1893: a route right now, in Studio's Live route view. The numbers are the MCP's route_now answer (the dev API runs
 * the same code, shared/liveNow.ts): the time of the reading and its age, where vehicles are bunched, where riders have
 * waited longest, each with the shared definitions under it. Only agencies the recorder reads every minute have it.
 */
interface Stretch { fromStop: string; toStop: string; stops: number; minutes: number; minAgo?: number; scheduledGapMin: number | null }
interface Direction { direction: string; vehiclesNow: number; standingNow: number; bunchedNow: Stretch[]; gappedNow: Stretch[] }
interface Answer { asOf?: string; dataAgeMin?: number; live?: null; directions?: Direction[]; definitions?: { bunched: string; gapped: string } }
type Ready = Answer & { directions: Direction[] };
const REFRESH_MS = 60_000;
/** The sidebar doesn't scroll: the closest pairs and the longest waits lead, the rest are counted. */
const SHOWN = 1;

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

export default function RouteNow({ agency, route }: { agency: string; route: string }) {
  const answer = useRouteNow(agency, route);
  if (!answer) return null;
  const stretches = (list: Stretch[], line: (x: Stretch) => string) => [
    ...list.slice(0, SHOWN).map(x => (
      <li key={`${x.fromStop}>${x.toStop}`} className="list-none">
        <span className="block font-bold">{stretchLabel(x.fromStop, x.toStop)}</span>
        <span className="block text-[var(--text-secondary)]">{line(x)}</span>
      </li>
    )),
    ...(list.length > SHOWN ? [<li key="more" className="list-none text-[var(--text-dim)]">{W.more(list.length - SHOWN)}</li>] : []),
  ];
  return (
    <Widget title={W.title} size="medium">
      {answer.asOf != null && answer.dataAgeMin != null && <p className="m-0 mb-2 text-xs leading-4 text-[var(--text-dim)]">{W.reading(answer.asOf, answer.dataAgeMin)}</p>}
      {answer.directions.map(d => (
        <div key={d.direction} className="mb-3 text-sm">
          <p className="m-0 font-bold">{d.direction}</p>
          <p className="m-0 text-xs text-[var(--text-dim)]">{W.vehicles(d.vehiclesNow, d.standingNow)}</p>
          <p className="m-0 mt-1 text-xs font-bold text-[var(--text-muted)]">{W.bunchedTitle}</p>
          {d.bunchedNow.length ? <ul className="m-0 p-0">{stretches([...d.bunchedNow].sort((a, b) => a.minutes - b.minutes), x => W.bunchedLine(x.minutes, x.minAgo ?? 0))}</ul> : <p className="m-0 text-[var(--text-secondary)]">{W.noBunched}</p>}
          <p className="m-0 mt-1 text-xs font-bold text-[var(--text-muted)]">{W.gappedTitle}</p>
          {d.gappedNow.length ? <ul className="m-0 p-0">{stretches([...d.gappedNow].sort((a, b) => b.minutes - a.minutes), x => W.gappedLine(x.minutes, x.scheduledGapMin))}</ul> : <p className="m-0 text-[var(--text-secondary)]">{W.noGapped}</p>}
        </div>
      ))}
      {answer.definitions && <p className="m-0 text-xs leading-4 text-[var(--text-dim)]">{answer.definitions.bunched} {answer.definitions.gapped}</p>}
    </Widget>
  );
}

/**
 * CIV-1828 redesign options: Right now as the week table's look, one row per direction (the column says it's a direction),
 * moving and standing vehicles together, and how many stretches are bunched or have a long gap. `places` (option A) names
 * the closest pair and the longest wait under the table, each "between X and Y". The definitions are in About (the week
 * table's Learn more), not under this card.
 */
export function RouteNowTable({ agency, route, places }: { agency: string; route: string; places: boolean }) {
  const answer = useRouteNow(agency, route);
  if (!answer) return null;
  const closest = places ? answer.directions.flatMap(d => d.bunchedNow).sort((a, b) => a.minutes - b.minutes)[0] : undefined;
  const longest = places ? answer.directions.flatMap(d => d.gappedNow).sort((a, b) => b.minutes - a.minutes)[0] : undefined;
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
