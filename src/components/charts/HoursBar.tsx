import { clockTime, hourTime, timeRange } from '../../../shared/timeText';
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
  // CIV-1605: each break ends on its exact times (or wider), never on the hour, so no service is drawn that isn't there.
  if (runs.gaps?.length === pieces.length - 1) {
    runs.gaps.forEach(([before, after], i) => { pieces[i][1] = before; pieces[i + 1][0] = after; });
  }
  // A piece whose break ends meet (one departure, or ends only bounded) is still drawn, as a sliver.
  const drawn = pieces.filter(([a, b]) => b >= a);
  const firstHour = runs.hours[0];
  const lastHour = runs.hours[runs.hours.length - 1];
  const label = `Runs ${runs.first != null ? `from ${clockTime(runs.first)}` : `from the ${hourTime(firstHour)} hour`} ${runs.last != null ? `until ${clockTime(runs.last)}` : `to the ${hourTime(lastHour)} hour`}`;
  // Each time sits at its own end of the bar, so a night route's times sit over its pieces, not at the axis's ends.
  // Ends too close for two labels share one range ("1–5:30 AM").
  const pct = (minutes: number) => (100 * (minutes - axis.first * 60)) / span;
  const startPct = pct(drawn[0]?.[0] ?? axis.first * 60);
  const endPct = pct(drawn[drawn.length - 1]?.[1] ?? (axis.last + 1) * 60);
  const atStart = (text: string) => ({ text, style: startPct <= 50 ? { left: `${startPct}%` } : { right: `${100 - startPct}%` } });
  const atEnd = (text: string) => ({ text, style: endPct >= 50 ? { right: `${100 - endPct}%` } : { left: `${endPct}%` } });
  const first = runs.first != null ? clockTime(runs.first) : null;
  const last = runs.last != null ? clockTime(runs.last) : null;
  const labels = first && last && endPct - startPct < 45
    ? [startPct <= 100 - endPct ? atStart(timeRange(runs.first!, runs.last!)) : atEnd(timeRange(runs.first!, runs.last!))]
    : [...(first ? [atStart(first)] : []), ...(last ? [atEnd(last)] : [])];
  return (
    <div className="min-w-[10rem]" role="img" aria-label={label}>
      <div className="relative h-4 text-xs text-[var(--text-muted)] whitespace-nowrap">
        {labels.map(l => <span key={l.text} className="absolute top-0" style={l.style}>{l.text}</span>)}
      </div>
      <div className="relative mt-0.5 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
        {drawn.map(([a, b]) => (
          <div key={a} className="absolute inset-y-0 rounded-full" style={{ left: at(a), width: `calc(${at(b)} - ${at(a)})`, minWidth: 2, background: FILL }} />
        ))}
      </div>
    </div>
  );
}
