import { stopNameCase } from './format';

/** Short names for chart axes: the cross street or the station, not the whole stop name. */
export function shortStopName(name: string): string {
  let n = name.replace(/\s+(North|South|East|West)\s+Side$/i, '').replace(/\s+Streetcar Platform$/i, '').trim();
  if (n.includes(' - ')) n = n.slice(n.lastIndexOf(' - ') + 3);
  const segments = n.split(/\s+at\s+/i);
  if (segments.length > 1) {
    const station = segments.find(s => /station/i.test(s)) ?? segments.find(s => /\b(loop|terminal)\b/i.test(s));
    n = station ?? segments[segments.length - 1];
  }
  const station = n.match(/^(.*?\bStation)\b/i);
  const short = (station ? station[1] : n).trim();
  // Close a bracket the name leaves open (the TTC feed has "University Ave (Queen's Park Station" with no closing one).
  return short.split('(').length > short.split(')').length ? `${short})` : short;
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

/**
 * The two ends of a stretch in short names. When the short names collide ("Queen St West" at both ends, each at a
 * different cross street), each end keeps its own cross street from the full stop name: "Queen St West (King St West)".
 */
export function stretchEnds(fromName: string, toName: string): [string, string] {
  const a = shortStopName(fromName), b = shortStopName(toName);
  if (a.toLowerCase() !== b.toLowerCase()) return [a, b];
  const withCross = (full: string, short: string) => {
    const cross = full.split(/\s+at\s+/i).map(x => x.trim()).find(x => x && x.toLowerCase() !== short.toLowerCase() && !short.toLowerCase().includes(x.toLowerCase()));
    return cross ? `${short} (${shortStopName(cross)})` : full;
  };
  return [withCross(fromName, a), withCross(toName, b)];
}

/** The one name for a stretch on every Live surface: "Church St to Dundas Station" (CIV-910). */
export function stretchLabel(fromName: string, toName: string): string {
  return stretchEnds(fromName, toName).join(' to ');
}

/** Words that make a side of " and " a place rather than a street ("Jane and Finch Station", "Guild Park and Gardens"). */
const PLACE_WORDS = /\b(station|stn|college|park|gardens?|hospital|centre|center|library|mall|plaza|loop|square|village|campus|school|university|terminal|beach)\b/i;
const STREET_SIDE = /^[A-Z][A-Za-z.'-]*( [A-Z][A-Za-z.'-]*){0,2}$/;

/**
 * "Broadview & Queen" for "Broadview and Queen": two street names joined with "&", as Live writes them (CIV-1043).
 * Only a whole name of exactly two sides, each one to three capitalized words with no place word ("Station",
 * "Park"...), so "Jane and Finch Station", "Guild Park and Gardens" and "… via Distillery and Ookwemin Minising"
 * are left as they are.
 */
export function streetJoin(name: string): string {
  const m = /^(.+?) and (.+)$/.exec(name);
  if (!m || / and | via /.test(m[2]) || / via /.test(m[1])) return name;
  const [a, b] = [m[1], m[2]];
  return STREET_SIDE.test(a) && STREET_SIDE.test(b) && !PLACE_WORDS.test(a) && !PLACE_WORDS.test(b) ? `${a} & ${b}` : name;
}

/** A stop as Live lists it: normal case, then the short name ("Bathurst", not "KING ST WEST AT BATHURST ST"), streets joined with "&". */
export const liveStopName = (name: string): string => streetJoin(shortStopName(stopNameCase(name)));
