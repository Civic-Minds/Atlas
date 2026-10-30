/**
 * CIV-994: which of a line's drawn stops count, in one place. A drop-off-only stop (#879: every own stop time is
 * pickup_type 1) has arrivals, not departures a rider can take, so the shared pool leaves its times out.
 */

/** The drawn stops a rider can board at: drop-off-only stops left out (tier grading, #879). */
export function boardableDrawnStops(drawn: readonly string[], dropOffOnly: ReadonlySet<string>): string[] {
  return drawn.filter(stopId => !dropOffOnly.has(stopId));
}

/**
 * The drawn stops before the terminal: the last stop left out, and with it the drop-off-only stops that run up to it.
 * A terminal drawn twice, platform then parent station, would otherwise keep one copy (#1116: MBTA 71 to Harvard read a
 * 135-minute AM gap at platform 76124 while all 91 trips run every 9 to 14). A drop-off-only stop with a boardable stop
 * after it, other than the terminal, is kept.
 */
export function drawnStopsBeforeTerminal(drawn: readonly string[], dropOffOnly: ReadonlySet<string>): string[] {
  let end = drawn.length - 1;
  while (end > 0 && dropOffOnly.has(drawn[end - 1]) && drawn.slice(end).every(stopId => dropOffOnly.has(stopId) || stopId === drawn[drawn.length - 1])) end--;
  return drawn.slice(0, Math.max(end, 0));
}

/**
 * The stop the headline reads (Step 4): the last drawn stop, unless that stop is drop-off only (#879), then the nearest
 * stop before it where a rider can board (CIV-1157). A drop-off-only end records arrivals, which bunch by running time:
 * CapMetro 985 southbound read 28 at its end where its trips leave every 30. Null when no drawn stop is boardable.
 */
export function headlineReadingStop(drawn: readonly string[], dropOffOnly: ReadonlySet<string>): string | null {
  const last = drawn.at(-1);
  if (last == null || !dropOffOnly.has(last)) return last ?? null;
  for (let i = drawn.length - 2; i >= 0; i--) if (!dropOffOnly.has(drawn[i])) return drawn[i];
  return last;
}
