/**
 * Where History's route chart puts each snapshot across its width (CIV-924). Points were placed by
 * year alone, so a route whose snapshots all fall in one year drew them in one column. Now each sits
 * at its month: a label gives only a month ("Jul 2026") or a year ("2026"), so snapshots sharing a
 * month are spread evenly inside it, in the published order (#1030). That spacing is only for reading
 * the chart; it says nothing about the day in the month.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The month (0 to 11) a snapshot label names ("Nov 2019" → 10), or null for a year alone ("2026"). */
export function snapshotMonth(label: string): number | null {
  const word = label.trim().match(/^([A-Za-z]+)\s+\d{4}$/)?.[1];
  if (!word) return null;
  const index = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return index >= 0 ? index : null;
}

/**
 * Each snapshot's place from 0 (oldest) to 1 (newest), oldest first. A label with no month sits mid-year.
 * Time never runs backwards along the list, and snapshots in the same month share it evenly.
 */
export function historyChartPositions(snaps: ReadonlyArray<{ label: string; year: number }>): number[] {
  const monthStart: number[] = [];
  for (const snap of snaps) {
    const month = snapshotMonth(snap.label) ?? 6;
    const start = snap.year * 12 + month;
    monthStart.push(Math.max(start, monthStart[monthStart.length - 1] ?? start));
  }
  const at: number[] = [];
  for (let i = 0; i < monthStart.length;) {
    let j = i;
    while (j < monthStart.length && monthStart[j] === monthStart[i]) j++;
    for (let k = i; k < j; k++) at.push(monthStart[i] + (k - i + 0.5) / (j - i));
    i = j;
  }
  if (at.length < 2) return at.map(() => 0.5);
  const lo = at[0];
  const span = at[at.length - 1] - lo;
  return at.map(t => (t - lo) / span);
}

/** The chart's frame in its own drawing units: the SVG viewBox and the inset that keeps points and labels off its edges. */
export interface HistoryChartFrame {
  width: number;
  height: number;
  paddingX: number;
  paddingY: number;
}

/** Where each snapshot is drawn, oldest first: across by month (historyChartPositions), up by its minutes (lowest at the top). */
export function historyChartPoints(
  snaps: ReadonlyArray<{ label: string; year: number }>,
  minutes: readonly number[],
  frame: HistoryChartFrame,
): Array<{ x: number; y: number }> {
  const positions = historyChartPositions(snaps);
  const min = Math.min(...minutes);
  const max = Math.max(...minutes);
  const range = max - min || 1;
  return minutes.map((m, i) => ({
    x: frame.paddingX + positions[i] * (frame.width - 2 * frame.paddingX),
    y: frame.height - frame.paddingY - (max === min ? 0.5 : (m - min) / range) * (frame.height - 2 * frame.paddingY),
  }));
}

/** The closest two drawn dots may be, in straight-line screen distance (CIV-1026). */
export const HISTORY_DOT_MIN_GAP_PX = 24;

/**
 * The order dots are tried in (CIV-1026): the first and the latest snapshot, then each year's last one (newest year
 * first), then every other snapshot whose minutes differ from the one before (newest first).
 */
export function historyDotPriority(snaps: ReadonlyArray<{ year: number }>, minutes: readonly number[]): number[] {
  const n = snaps.length;
  const order: number[] = [];
  const add = (i: number) => { if (i >= 0 && i < n && !order.includes(i)) order.push(i); };
  add(0); add(n - 1);
  for (let i = n - 1; i >= 0; i--) if (i === n - 1 || snaps[i + 1].year !== snaps[i].year) add(i);
  for (let i = n - 1; i > 0; i--) if (minutes[i] !== minutes[i - 1]) add(i);
  return order;
}

/** The dots drawn: each in priority order, kept only when it is at least `minGapPx` from every dot already kept. */
export function placeHistoryDots(points: ReadonlyArray<{ x: number; y: number }>, priority: readonly number[], pxPerUnit: number, minGapPx = HISTORY_DOT_MIN_GAP_PX): Set<number> {
  const kept: number[] = [];
  for (const i of priority) {
    if (kept.every(k => Math.hypot(points[i].x - points[k].x, points[i].y - points[k].y) * pxPerUnit >= minGapPx)) kept.push(i);
  }
  return new Set(kept);
}

/** Each January inside the history, at its place along the chart (0 to 1, on historyChartPositions' scale): the year ticks of a long axis. */
export function historyYearTicks(snaps: ReadonlyArray<{ label: string; year: number }>): Array<{ year: number; position: number }> {
  if (snaps.length < 2) return [];
  const startOf = (s: { label: string; year: number }) => s.year * 12 + (snapshotMonth(s.label) ?? 6);
  const lo = startOf(snaps[0]) + 0.5 / Math.max(1, snaps.filter(x => startOf(x) === startOf(snaps[0])).length);
  const lastStart = startOf(snaps[snaps.length - 1]);
  const lastCount = snaps.filter(x => startOf(x) === lastStart).length;
  const hi = lastStart + (lastCount - 0.5) / lastCount;
  const out: Array<{ year: number; position: number }> = [];
  for (let y = snaps[0].year + 1; y * 12 <= hi; y++) out.push({ year: y, position: (y * 12 - lo) / (hi - lo) });
  return out;
}
