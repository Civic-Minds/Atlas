import { clockTime, hourTime } from '../../../shared/timeText';
import type { AgencyPageRoute } from '../../../shared/agencyPages';

/** The track's colour: the split bar's no-service grey. */
const TRACK = 'var(--control-inactive-bg)';
const FILL = 'var(--text-muted)';

/**
 * CIV-1605 (prototype, beta): one route's weekday hours of service as a thin bar on the agency's shared hour axis, with
 * its exact first and last times written at the ends where the data has them. An end without an exact time stops on the
 * hour and gets no label, so no time is guessed. Every route in a table passes the same `axis` so the bars line up.
 */
export default function HoursBar({ runs, axis }: { runs: NonNullable<AgencyPageRoute['runs']>; axis: { first: number; last: number } }) {
  const span = (axis.last + 1 - axis.first) * 60;
  const at = (minutes: number) => `${(100 * (minutes - axis.first * 60)) / span}%`;
  // Runs of consecutive hours, each drawn as one piece; the first and last pieces end on the exact times where known.
  const pieces: Array<[number, number]> = [];
  for (const h of runs.hours) {
    const prev = pieces[pieces.length - 1];
    if (prev && prev[1] === h * 60) prev[1] = (h + 1) * 60;
    else pieces.push([h * 60, (h + 1) * 60]);
  }
  if (runs.first != null) pieces[0][0] = runs.first;
  if (runs.last != null) pieces[pieces.length - 1][1] = runs.last;
  const firstHour = runs.hours[0];
  const lastHour = runs.hours[runs.hours.length - 1];
  const label = `Runs ${runs.first != null ? `from ${clockTime(runs.first)}` : `from the ${hourTime(firstHour)} hour`} ${runs.last != null ? `until ${clockTime(runs.last)}` : `to the ${hourTime(lastHour)} hour`}`;
  return (
    <div className="min-w-[10rem]" role="img" aria-label={label}>
      <div className="flex justify-between text-xs tabular-nums text-[var(--text-muted)] whitespace-nowrap">
        <span>{runs.first != null ? clockTime(runs.first) : ''}</span>
        <span>{runs.last != null ? clockTime(runs.last) : ''}</span>
      </div>
      <div className="relative mt-0.5 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
        {pieces.map(([a, b]) => (
          <div key={a} className="absolute inset-y-0 rounded-full" style={{ left: at(a), width: `calc(${at(b)} - ${at(a)})`, background: FILL }} />
        ))}
      </div>
    </div>
  );
}
