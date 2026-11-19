import { useEffect, useState } from 'react';
import Widget from '../../components/Live/tool/Widget';
import { STUDIO_NOW_PENDING as W } from '../../../shared/liveWording';
import { stretchLabel } from '../../utils/stopLabel';

/**
 * CIV-1893: a route right now, in Studio's Live route view. The numbers are the MCP's route_now answer (the dev API runs
 * the same code, shared/liveNow.ts): the time of the reading and its age, where vehicles are bunched, where riders have
 * waited longest, each with the shared definitions under it. Only agencies the recorder reads every minute have it.
 */
interface Stretch { fromStop: string; toStop: string; stops: number; minutes: number; minAgo?: number; scheduledGapMin: number | null }
interface Direction { direction: string; vehiclesNow: number; standingNow: number; bunchedNow: Stretch[]; gappedNow: Stretch[] }
interface Answer { asOf?: string; dataAgeMin?: number; live?: null; directions?: Direction[]; definitions?: { bunched: string; gapped: string } }
const REFRESH_MS = 60_000;
/** The sidebar doesn't scroll: the closest pairs and the longest waits lead, the rest are counted. */
const SHOWN = 1;

export const ROUTE_NOW_URL = '/api/route-now';

export default function RouteNow({ agency, route }: { agency: string; route: string }) {
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
  if (answer == null || answer === 'none' || answer.live === null || !answer.directions) return null;
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
