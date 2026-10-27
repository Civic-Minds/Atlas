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
