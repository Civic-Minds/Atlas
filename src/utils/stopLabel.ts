// "Station" as a stop's name, not part of a street name ("Village Station Rd", "Station Av").
const STATION = /\bStation\b(?!\s+(?:Rd|Road|Av|Ave|Avenue|St|Street|Dr|Drive|Blvd|Ln|Lane|Way|Sq|Square|Pl|Place)\b)/i;

/** The last " - " outside brackets, or -1 ("MEMORIAL DR @ 5019 (GPTC - NORTH ENTRANCE)" has none). */
function lastTopLevelDash(n: string): number {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < n.length; i++) {
    if (n[i] === '(') depth++;
    else if (n[i] === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && n.startsWith(' - ', i)) at = i;
  }
  return at;
}

// What follows " - " when it only says where the stop sits, not the place: SEPTA's "FS", "MBNS 1", "onsite 2", "Rt 58",
// "B1", "north", "opposite"; MBTA's "West" and town or transit lines ("Winchester Line", "Green Line") (#1237); a
// "Bay C", a gate or a platform.
const STOP_DETAIL = new RegExp(`^(?:${[
  '(?:\\d+\\s*)?(?:FS|NS|MBFS|MBNS|onsite)(?:\\s+(?:\\d+|layover|Route\\s+\\w+))?',
  '\\d+(?:\\s+bus)?',
  'bus',
  '(?:Rts?|Route)\\s+(?:\\d+\\w?|[A-Z])\\b(?:(?:\\s*&\\s*|\\s+)(?:\\d+\\w?|[A-Z])\\b)*(?:\\s+drop)?',
  '(?:north|south|east|west)(?:bound)?(?:\\s+(?:side|entrance))?',
  'opposite(?:\\s+shelter)?',
  '(?:Main\\s+)?Drop-?off(?:\\s+Only)?',
  'B\\d+(?:\\s*&\\s*B\\d+)?',
  'Bay\\s+(?:[A-Z]|\\d+)',
  'Gate\\s+#?\\d+\\w?',
  '\\w+(?:\\s+\\w+)?\\s+Line',
  '.*\\bPlatform',
].join('|')})$`, 'i');

/**
 * Short names for chart axes and the Live strip: the cross street or the station, not the whole stop name.
 * Around " - ", the place after it wins ("Bay St at Bloor St West - Bay Station", "2395 Bayview Ave - Bob Rumball
 * Centre For The Deaf"), unless only the part before it is a station, loop or terminal ("Decatur Station - Church St NB",
 * "Warden Station - Westbound Platform") or the part after it is only a stop detail ("Broad St & Pattison Av - FS") (#1235).
 */
export function shortStopName(name: string): string {
  let n = name.replace(/\s+(North|South|East|West)\s+Side$/i, '').replace(/\s+Streetcar Platform$/i, '').trim();
  const dash = lastTopLevelDash(n);
  if (dash >= 0) {
    const head = n.slice(0, dash), tail = n.slice(dash + 3);
    const isPlace = (part: string) => STATION.test(part) || /\b(loop|terminal)\b/i.test(part);
    const headIsPlace = isPlace(head) && !isPlace(tail) && !/\s+at\s+/i.test(head);
    n = headIsPlace || STOP_DETAIL.test(tail.trim()) ? head : tail;
  }
  const segments = n.split(/\s+at\s+/i);
  if (segments.length > 1) {
    const station = segments.find(s => STATION.test(s)) ?? segments.find(s => /\b(loop|terminal)\b/i.test(s));
    n = station ?? segments[segments.length - 1];
  }
  const station = STATION.exec(n);
  const short = (station ? n.slice(0, station.index + station[0].length) : n).trim();
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
