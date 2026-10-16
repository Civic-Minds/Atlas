/** Short names for chart axes: the cross street or the station, not the whole stop name. */
export function shortStopName(name: string): string {
  let n = name.replace(/\s+(North|South|East|West)\s+Side$/i, '').replace(/\s+Streetcar Platform$/i, '').trim();
  if (n.includes(' - ')) n = n.slice(n.lastIndexOf(' - ') + 3);
  const segments = n.split(/\s+at\s+/i);
  if (segments.length > 1) {
    const station = segments.find(s => /station/i.test(s));
    n = station ?? segments[segments.length - 1];
  }
  const station = n.match(/^(.*?\bStation)\b/i);
  return (station ? station[1] : n).trim();
}

/** A stop worth naming on an axis even when space is short: stations, loops and terminals. */
export function isMajorStop(name: string): boolean {
  return /\b(station|loop|terminal)\b/i.test(name);
}

/**
 * Which points get a name under the chart. Priority: first, last, marked, major stops, then evenly spread fill-ins.
 * A name is kept only when it fits beside the ones already chosen, so none overlap. Widths are in px.
 */
export function pickAxisLabels(opts: { count: number; width: number; widths: readonly number[]; marked: readonly number[]; major: readonly number[]; max: number; gap?: number }): Array<{ index: number; left: number }> {
  const { count, width, widths, max, gap = 8 } = opts;
  if (count < 1 || width <= 0) return [];
  const order: number[] = [0, count - 1, ...opts.marked, ...opts.major];
  // Bisection order for fill-ins: middle, quarters, eighths...
  for (let step = count; step >= 1; step = Math.floor(step / 2)) for (let i = Math.floor(step / 2); i < count; i += step) order.push(i);
  for (let i = 0; i < count; i++) order.push(i);
  const placed: Array<{ index: number; left: number; right: number }> = [];
  for (const index of order) {
    if (placed.length >= max) break;
    if (placed.some(p => p.index === index) || index < 0 || index >= count) continue;
    const w = Math.min(widths[index] ?? 40, width);
    const center = ((index + 0.5) / count) * width;
    const left = Math.max(0, Math.min(width - w, center - w / 2));
    if (placed.some(p => left < p.right + gap && left + w + gap > p.left)) continue;
    placed.push({ index, left, right: left + w });
  }
  return placed.sort((a, b) => a.index - b.index).map(p => ({ index: p.index, left: p.left }));
}
