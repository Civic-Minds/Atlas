/**
 * Which point labels a small chart can draw without them overlapping (#1037): the first and last
 * always show; a label in between shows only if its box clears every label already shown. Boxes are
 * centred on the point: `width` across, `height` up and down. Used for History's value labels
 * (two snapshots in the same month sit on top of each other) and its x-axis labels (height 0).
 */
export function labelsThatFit(points: ReadonlyArray<{ x: number; y: number }>, width: number, height = 0): Set<number> {
  const shown: number[] = [];
  const fits = (i: number) => shown.every(j =>
    Math.abs(points[i].x - points[j].x) >= width || (height > 0 && Math.abs(points[i].y - points[j].y) >= height));
  const order = points.length <= 1 ? points.map((_, i) => i) : [points.length - 1, 0, ...points.map((_, i) => i).slice(1, -1)];
  for (const i of order) {
    if (shown.length < 2 && (i === 0 || i === points.length - 1)) { shown.push(i); continue; }
    if (fits(i)) shown.push(i);
  }
  return new Set(shown);
}
