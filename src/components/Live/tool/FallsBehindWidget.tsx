import { useState } from 'react';
import Widget from './Widget';
import { STUDIO_LIVE_PENDING as W, serviceDaysText } from '../../../../shared/liveWording';
import { stretchLabel } from '../../../utils/stopLabel';
import type { TimeLossListRow } from '../../../utils/timeLossReport';

/**
 * CIV-1828: the stop pairs where vehicles fall furthest behind the schedule, largest first (the time-loss report's
 * rows), each a button that opens it on the map; under them, collapsed, the ones whose schedule is looser than needed.
 * `showRoute`: the network list names each row's route.
 */
export default function FallsBehindWidget({ title, slower, looser, showRoute, dates, onPick }: {
  title: string; slower: readonly TimeLossListRow[]; looser: readonly TimeLossListRow[]; showRoute: boolean;
  /** The days the figures cover, for the line under the title. */ dates: readonly string[];
  onPick: (r: TimeLossListRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const days = dates.length ? serviceDaysText(dates.length, dates[0], dates[dates.length - 1]) : null;
  const item = (x: TimeLossListRow, lines: string[]) => (
    <li key={`${x.route}:${x.directionId}:${x.row.fromStopId}>${x.row.toStopId}`} className="list-none">
      <button type="button" onClick={() => onPick(x)} className="w-full rounded-lg px-1.5 py-1.5 text-left text-sm hover:bg-[var(--bg-hover)] max-sm:min-h-[44px]">
        <span className="block font-bold">{showRoute ? `${x.route} · ` : ''}{stretchLabel(x.row.fromName, x.row.toName)}</span>
        {lines.map(l => <span key={l} className="block text-[var(--text-secondary)]">{l}</span>)}
      </button>
    </li>
  );
  return (
    <Widget title={title} size="medium">
      {days && <p className="m-0 mb-1 text-xs leading-4 text-[var(--text-dim)]">{days}</p>}
      <ul className="m-0 p-0">
        {slower.map(x => item(x, [W.takesLonger(x.row.typicalMin), ...(x.row.showP90 ? [W.oneInTen(x.row.p90MinDown)] : []), W.sample(x.row.passes, x.row.days)]))}
      </ul>
      {looser.length > 0 && (
        <div className="mt-2 border-t border-[var(--border-primary)] pt-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            {open ? '▾' : '▸'} {W.looserTitle}
          </button>
          {open && <ul className="m-0 mt-1 p-0">{looser.map(x => item(x, [W.looserLine(-x.row.typicalMin), W.sample(x.row.passes, x.row.days)]))}</ul>}
        </div>
      )}
    </Widget>
  );
}
