import { slugifyForFilename } from './mapExportDetails';

export const MAP_EXPORT_SIZES = [
  { id: 'social', label: 'Social', width: 1200, height: 630 },
  { id: 'standard', label: 'Standard', width: 1600, height: 900 },
  { id: 'high', label: 'High resolution', width: 2400, height: 1350 },
] as const;

export type MapExportSizeId = typeof MAP_EXPORT_SIZES[number]['id'];
export type MapExportSize = typeof MAP_EXPORT_SIZES[number];

export const DEFAULT_MAP_EXPORT_SIZE = MAP_EXPORT_SIZES[1];
// Backwards-compatible aliases for the standard export size.
export const MAP_EXPORT_WIDTH = DEFAULT_MAP_EXPORT_SIZE.width;
export const MAP_EXPORT_HEIGHT = DEFAULT_MAP_EXPORT_SIZE.height;

export interface MapExportKeyEntry {
  color: string;
  label: string;
}

/** The selected route, shown beside the heading with its own line colour. */
export interface MapExportRoute {
  label: string;
  color: string;
}

/** What the image says about the view. Every field comes from the map's own state. */
export interface MapExportText {
  /** Large heading, usually the place in view (e.g. "Toronto"). */
  title: string;
  /** Small label above the heading, e.g. "Transit frequency". */
  eyebrow?: string | null;
  /** Smaller lines under the heading: the filter in plain words. */
  lines?: string[];
  /** Selected route, when one is drawn in the view. */
  route?: MapExportRoute | null;
  /** Colour key, only the colours actually drawn on the map. */
  key?: MapExportKeyEntry[];
  /** Small heading before the key, e.g. "Base fare". */
  keyTitle?: string;
}

interface MapExportOptions extends MapExportText {
  source: HTMLCanvasElement;
  lightMode: boolean;
  size?: MapExportSize;
}

export const MAP_EXPORT_BRAND = 'Explore the map at transitatlas.fyi';
export const MAP_EXPORT_CREDIT = 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';

/**
 * Poster measurements in layout units. Landscape units are pixels of the standard 1600px
 * image; portrait units are pixels of a 666px-wide phone image. Everything scales together.
 */
interface PosterMetrics {
  baseWidth: number;
  margin: number;
  top: number;
  eyebrow: { size: number; row: number };
  title: { size: number; row: number };
  line: { size: number; row: number };
  route: { size: number; row: number; gap: number; swatch: [number, number] };
  headerPad: number;
  footerGap: number;
  key: { size: number; row: number; swatch: [number, number]; gap: number; columnGap: number };
  brand: { size: number; row: number };
  credit: { size: number; row: number };
  footerPad: number;
  radius: number;
}

const LANDSCAPE: PosterMetrics = {
  baseWidth: 1600,
  margin: 56,
  top: 48,
  eyebrow: { size: 15, row: 32 },
  title: { size: 60, row: 66 },
  line: { size: 20, row: 28 },
  route: { size: 18, row: 34, gap: 10, swatch: [30, 7] },
  headerPad: 32,
  footerGap: 20,
  key: { size: 15, row: 26, swatch: [26, 6], gap: 8, columnGap: 28 },
  brand: { size: 16, row: 0 },
  credit: { size: 11, row: 20 },
  footerPad: 22,
  radius: 12,
};

const PORTRAIT: PosterMetrics = {
  baseWidth: 666,
  margin: 30,
  top: 24,
  eyebrow: { size: 14, row: 28 },
  title: { size: 44, row: 52 },
  line: { size: 16, row: 22 },
  route: { size: 15, row: 30, gap: 14, swatch: [28, 7] },
  headerPad: 18,
  footerGap: 18,
  key: { size: 13, row: 22, swatch: [26, 6], gap: 8, columnGap: 24 },
  brand: { size: 13, row: 20 },
  credit: { size: 10.5, row: 19 },
  footerPad: 26,
  radius: 12,
};

const font = (weight: number, px: number) => `${weight} ${px}px ${FONT}`;
const EYEBROW_WEIGHT = 600;
const TITLE_WEIGHT = 800;
const LINE_WEIGHT = 500;
const ROUTE_WEIGHT = 700;
const KEY_WEIGHT = 600;
const BRAND_WEIGHT = 700;
const CREDIT_WEIGHT = 500;

type Measure = (text: string, weight: number, px: number) => number;

/** Text measurer from a canvas, or a rough estimate when no canvas exists (tests, server). */
function measurerFor(context?: CanvasRenderingContext2D | null): Measure {
  const ctx = context ?? (typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null);
  if (!ctx) return (text, _weight, px) => text.length * px * 0.55;
  return (text, weight, px) => {
    ctx.font = font(weight, px);
    return ctx.measureText(text).width;
  };
}

function fitText(measure: (text: string) => number, text: string, maxWidth: number): string {
  if (measure(text) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && measure(`${result}…`) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

/**
 * Wrap a description line to the image width without dropping any words: break between
 * " · " parts first, then between words. Never shortens with an ellipsis, so a filter is
 * never shown half-cut.
 */
export function wrapExportLine(measure: (text: string) => number, text: string, maxWidth: number): string[] {
  if (measure(text) <= maxWidth) return [text];
  const out: string[] = [];
  let current = '';
  const push = (piece: string, joiner: string) => {
    const candidate = current ? `${current}${joiner}${piece}` : piece;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      out.push(current);
      current = piece;
    }
  };
  for (const part of text.split(' · ')) {
    if (measure(part) <= maxWidth) {
      push(part, ' · ');
      continue;
    }
    // One part is wider than the image on its own: wrap it by words.
    for (const [index, word] of part.split(' ').entries()) push(word, index === 0 ? ' · ' : ' ');
  }
  if (current) out.push(current);
  return out;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  // A data URL keeps the export path deterministic across browsers where a WebGL-backed
  // canvas can leave toBlob's callback pending while the context is being flushed.
  const dataUrl = canvas.toDataURL('image/png');
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('Could not create the export image');
  return blob;
}

interface KeyCell {
  /** Offset from the row start, in layout units. */
  x: number;
  label: string;
  /** Missing for the key's title cell. */
  color?: string;
}

/** Text placed in layout units; the same plan serves every export size of one shape. */
interface MapExportPlan {
  metrics: PosterMetrics;
  portrait: boolean;
  eyebrow: { text: string; y: number } | null;
  title: { text: string; y: number };
  lines: { text: string; y: number }[];
  route: { label: string; color: string; y: number; beside: boolean } | null;
  headerHeight: number;
  keyRows: { cells: KeyCell[]; y: number }[];
  brand: { text: string; y: number };
  credit: { text: string; y: number };
  footerHeight: number;
}

function planMapExport(text: MapExportText, portrait: boolean, measure: Measure): MapExportPlan {
  const m = portrait ? PORTRAIT : LANDSCAPE;
  const textWidth = m.baseWidth - m.margin * 2;
  const routeWidth = (label: string) => m.route.swatch[0] + m.route.gap + measure(label, ROUTE_WEIGHT, m.route.size);
  const titleWidth = (value: string) => measure(value, TITLE_WEIGHT, m.title.size);

  const rawTitle = text.title.trim() || 'Transit map';
  let route: MapExportPlan['route'] = null;
  let titleMax = textWidth;
  if (text.route?.label) {
    const label = fitText(value => routeWidth(value), text.route.label, textWidth);
    // Landscape puts the route beside the heading when both fit; otherwise it gets its own row.
    const beside = !portrait && titleWidth(rawTitle) + 40 + routeWidth(label) <= textWidth;
    if (beside) titleMax = textWidth - routeWidth(label) - 40;
    route = { label, color: text.route.color, y: 0, beside };
  }

  let y = m.top;
  let eyebrow: MapExportPlan['eyebrow'] = null;
  const eyebrowText = text.eyebrow?.trim();
  if (eyebrowText) {
    eyebrow = { text: fitText(value => measure(value, EYEBROW_WEIGHT, m.eyebrow.size), eyebrowText, textWidth), y: y + m.eyebrow.row / 2 };
    y += m.eyebrow.row;
  }
  const title = { text: fitText(titleWidth, rawTitle, titleMax), y: y + m.title.row / 2 };
  y += m.title.row;
  if (route?.beside) route.y = title.y;

  const lines = (text.lines ?? [])
    .flatMap(line => wrapExportLine(value => measure(value, LINE_WEIGHT, m.line.size), line, textWidth))
    .map(line => {
      const placed = { text: line, y: y + m.line.row / 2 };
      y += m.line.row;
      return placed;
    });
  if (route && !route.beside) {
    y += m.route.gap;
    route.y = y + m.route.row / 2;
    y += m.route.row;
  }
  const headerHeight = y + m.headerPad;

  // Footer, measured from the map's bottom edge.
  const brandText = MAP_EXPORT_BRAND;
  const brandWidth = measure(brandText, BRAND_WEIGHT, m.brand.size);
  const keyWidth = portrait ? textWidth : textWidth - brandWidth - 40;
  const cells: Array<{ width: number; label: string; color?: string }> = [];
  const key = text.key ?? [];
  if (key.length > 0 && text.keyTitle) cells.push({ width: measure(text.keyTitle, KEY_WEIGHT, m.key.size), label: text.keyTitle });
  for (const entry of key) {
    cells.push({ width: m.key.swatch[0] + m.key.gap + measure(entry.label, KEY_WEIGHT, m.key.size), label: entry.label, color: entry.color });
  }
  const rows: KeyCell[][] = [];
  let x = 0;
  for (const cell of cells) {
    if (rows.length === 0 || (x > 0 && x + cell.width > keyWidth)) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push({ x, label: cell.label, color: cell.color });
    x += cell.width + m.key.columnGap;
  }

  let fy = m.footerGap;
  const keyRows = rows.map(cellsInRow => {
    const row = { cells: cellsInRow, y: fy + m.key.row / 2 };
    fy += m.key.row;
    return row;
  });
  let brand: MapExportPlan['brand'];
  if (portrait) {
    brand = { text: brandText, y: fy + m.brand.row / 2 };
    fy += m.brand.row;
  } else {
    // Landscape: the brand sits at the right end of the first key row.
    if (keyRows.length === 0) fy += m.key.row;
    brand = { text: brandText, y: m.footerGap + m.key.row / 2 };
  }
  const credit = { text: MAP_EXPORT_CREDIT, y: fy + m.credit.row / 2 };
  fy += m.credit.row;
  const footerHeight = fy + m.footerPad;

  return { metrics: m, portrait, eyebrow, title, lines, route, headerHeight, keyRows, brand, credit, footerHeight };
}

export interface MapExportLayout {
  width: number;
  height: number;
  /** Pixels per layout unit (see PosterMetrics). */
  scale: number;
  headerHeight: number;
  footerHeight: number;
  /** Portrait exports stack the footer (key, link, credit) on separate rows. */
  stackedFooter: boolean;
  /** Part of the source canvas that is drawn (in source pixels). */
  sourceRect: { x: number; y: number; width: number; height: number };
  /** Where that part lands in the export (in export pixels). */
  mapRect: { x: number; y: number; width: number; height: number };
}

function layoutFromPlan(plan: MapExportPlan, sourceWidth: number, sourceHeight: number, size: MapExportSize): MapExportLayout {
  const m = plan.metrics;
  if (!plan.portrait) {
    const scale = size.width / m.baseWidth;
    const headerHeight = Math.round(plan.headerHeight * scale);
    const footerHeight = Math.round(plan.footerHeight * scale);
    const margin = Math.round(m.margin * scale);
    const mapRect = { x: margin, y: headerHeight, width: size.width - margin * 2, height: size.height - headerHeight - footerHeight };
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = mapRect.width / mapRect.height;
    const sourceRect = { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
    if (sourceRatio > targetRatio) {
      sourceRect.width = sourceHeight * targetRatio;
      sourceRect.x = (sourceWidth - sourceRect.width) / 2;
    } else {
      sourceRect.height = sourceWidth / targetRatio;
      sourceRect.y = (sourceHeight - sourceRect.height) / 2;
    }
    return { width: size.width, height: size.height, scale, headerHeight, footerHeight, stackedFooter: false, sourceRect, mapRect };
  }

  // Portrait: keep the screen's own shape (nothing cropped), make the preset's long edge the
  // image height, and never draw the map larger than the screen's real pixels.
  const mapUnits = m.baseWidth - m.margin * 2;
  const ratio = sourceHeight / sourceWidth;
  const heightUnits = plan.headerHeight + plan.footerHeight + mapUnits * ratio;
  const scale = Math.min(sourceWidth / mapUnits, size.width / heightUnits);
  const margin = Math.round(m.margin * scale);
  const mapWidth = Math.round(mapUnits * scale);
  const mapHeight = Math.round(mapWidth * ratio);
  const headerHeight = Math.round(plan.headerHeight * scale);
  const footerHeight = Math.round(plan.footerHeight * scale);
  return {
    width: mapWidth + margin * 2,
    height: headerHeight + mapHeight + footerHeight,
    scale,
    headerHeight,
    footerHeight,
    stackedFooter: true,
    sourceRect: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    mapRect: { x: margin, y: headerHeight, width: mapWidth, height: mapHeight },
  };
}

/**
 * Work out the export image size and how the map is placed in it.
 *
 * Landscape screens keep the fixed preset size (a light centre crop to the map frame's
 * shape). Portrait screens (phones) keep the screen's own shape instead: the whole visible
 * map is used, nothing is cropped, and it is never drawn larger than the screen's real
 * pixels, so it is never stretched or blurred. The header and footer grow to fit `text`.
 */
export function getMapExportLayout(
  sourceWidth: number,
  sourceHeight: number,
  size: MapExportSize = DEFAULT_MAP_EXPORT_SIZE,
  text: MapExportText = { title: '' },
  context?: CanvasRenderingContext2D | null,
): MapExportLayout {
  const plan = planMapExport(text, sourceWidth < sourceHeight, measurerFor(context));
  return layoutFromPlan(plan, sourceWidth, sourceHeight, size);
}

/** Output size of an export, including the header and footer this view needs. */
export function getMapExportOutputSize(sourceWidth: number, sourceHeight: number, size: MapExportSize, text: MapExportText = { title: '' }): { width: number; height: number } {
  const layout = getMapExportLayout(sourceWidth, sourceHeight, size, text);
  return { width: layout.width, height: layout.height };
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function pill(context: CanvasRenderingContext2D, x: number, centerY: number, width: number, height: number, color: string) {
  context.fillStyle = color;
  roundedRectPath(context, x, centerY - height / 2, width, height, height / 2);
  context.fill();
}

const POSTER_COLORS = {
  light: { background: '#f4f1ea', foreground: '#1c1917', muted: '#5f5b55', faint: '#78736c', border: 'rgba(28, 25, 23, 0.14)' },
  dark: { background: '#121214', foreground: '#f4f4f5', muted: '#b4b4bb', faint: '#9a9aa2', border: 'rgba(244, 244, 245, 0.16)' },
};

/** Compose the rendered map into a shareable poster: heading, framed map, key and link. */
export async function createMapExport({ source, lightMode, size = DEFAULT_MAP_EXPORT_SIZE, ...text }: MapExportOptions): Promise<Blob> {
  if (source.width === 0 || source.height === 0) {
    throw new Error('The map is not ready to export');
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the export image');
  const plan = planMapExport(text, source.width < source.height, measurerFor(context));
  const layout = layoutFromPlan(plan, source.width, source.height, size);
  canvas.width = layout.width;
  canvas.height = layout.height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const colors = lightMode ? POSTER_COLORS.light : POSTER_COLORS.dark;
  const m = plan.metrics;
  const s = layout.scale;
  const { sourceRect, mapRect } = layout;
  const left = mapRect.x;
  const right = mapRect.x + mapRect.width;
  const footerTop = mapRect.y + mapRect.height;

  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  // The map, framed with rounded corners and a hairline border.
  const radius = m.radius * s;
  context.save();
  roundedRectPath(context, mapRect.x, mapRect.y, mapRect.width, mapRect.height, radius);
  context.clip();
  context.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, mapRect.x, mapRect.y, mapRect.width, mapRect.height);
  context.restore();
  context.strokeStyle = colors.border;
  context.lineWidth = Math.max(1, s);
  roundedRectPath(context, mapRect.x, mapRect.y, mapRect.width, mapRect.height, radius);
  context.stroke();

  context.textBaseline = 'middle';
  context.textAlign = 'left';
  if (plan.eyebrow) {
    context.fillStyle = colors.muted;
    context.font = font(EYEBROW_WEIGHT, m.eyebrow.size * s);
    context.fillText(plan.eyebrow.text, left, plan.eyebrow.y * s);
  }
  context.fillStyle = colors.foreground;
  context.font = font(TITLE_WEIGHT, m.title.size * s);
  context.fillText(plan.title.text, left, plan.title.y * s);

  context.fillStyle = colors.muted;
  context.font = font(LINE_WEIGHT, m.line.size * s);
  for (const line of plan.lines) context.fillText(line.text, left, line.y * s);

  if (plan.route) {
    context.font = font(ROUTE_WEIGHT, m.route.size * s);
    const [swatchWidth, swatchHeight] = m.route.swatch;
    const labelWidth = context.measureText(plan.route.label).width;
    const x = plan.route.beside ? right - labelWidth - (swatchWidth + m.route.gap) * s : left;
    pill(context, x, plan.route.y * s, swatchWidth * s, swatchHeight * s, plan.route.color);
    context.fillStyle = colors.foreground;
    context.fillText(plan.route.label, x + (swatchWidth + m.route.gap) * s, plan.route.y * s);
  }

  context.font = font(KEY_WEIGHT, m.key.size * s);
  for (const row of plan.keyRows) {
    const y = footerTop + row.y * s;
    for (const cell of row.cells) {
      const x = left + cell.x * s;
      if (cell.color) {
        pill(context, x, y, m.key.swatch[0] * s, m.key.swatch[1] * s, cell.color);
        context.fillStyle = colors.foreground;
        context.fillText(cell.label, x + (m.key.swatch[0] + m.key.gap) * s, y);
      } else {
        context.fillStyle = colors.muted;
        context.fillText(cell.label, x, y);
      }
    }
  }

  context.fillStyle = colors.foreground;
  context.font = font(BRAND_WEIGHT, m.brand.size * s);
  context.textAlign = plan.portrait ? 'left' : 'right';
  context.fillText(plan.brand.text, plan.portrait ? left : right, footerTop + plan.brand.y * s);

  context.fillStyle = colors.faint;
  context.font = font(CREDIT_WEIGHT, m.credit.size * s);
  const creditFit = fitText(value => context.measureText(value).width, plan.credit.text, mapRect.width);
  context.fillText(creditFit, plan.portrait ? left : right, footerTop + plan.credit.y * s);
  context.textAlign = 'left';

  return canvasToBlob(canvas);
}

export type MapExportBlockReason = 'timeout' | 'no-routes' | 'failed-networks';

/** Raised when exporting now would save an image that is missing route data. */
export class MapExportBlockedError extends Error {
  constructor(public readonly reason: MapExportBlockReason) {
    super(MAP_EXPORT_BLOCKED_MESSAGES[reason]);
    this.name = 'MapExportBlockedError';
  }
}

export const MAP_EXPORT_BLOCKED_MESSAGES: Record<MapExportBlockReason, string> = {
  timeout: 'The map is still loading, so the image would be missing routes. Try again in a moment.',
  'no-routes': 'No routes are showing in this view yet. Move the map to an area with service and try again.',
  'failed-networks': 'Some transit networks did not load, so the image would be missing routes. Reload the page and try again.',
};

/** The parts of a MapLibre map the export readiness check needs. */
export interface MapExportReadinessTarget {
  loaded(): boolean;
  areTilesLoaded(): boolean;
  isMoving(): boolean;
  triggerRepaint(): void;
  once(type: 'idle', listener: () => void): unknown;
  off(type: 'idle', listener: () => void): unknown;
}

interface WaitForMapExportReadyOptions {
  map: MapExportReadinessTarget;
  /** True while agency route data for the current view is still downloading. */
  isDataLoading: () => boolean;
  /** True when some agency data for the current view failed to load. */
  hasFailedData?: () => boolean;
  /** True when at least one route is drawn in the current view. */
  hasRenderedRoutes: () => boolean;
  timeoutMs?: number;
  pollMs?: number;
  /** How long a fully loaded view must stay empty before it is reported as having no routes. */
  emptyGraceMs?: number;
}

/**
 * Resolve once the map has finished loading everything for the current view and has
 * drawn a full frame, or reject with a plain-language reason. Never waits forever.
 */
export async function waitForMapExportReady({
  map,
  isDataLoading,
  hasFailedData = () => false,
  hasRenderedRoutes,
  timeoutMs = 30000,
  pollMs = 250,
  emptyGraceMs = 3000,
}: WaitForMapExportReadyOptions): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const settled = () => !isDataLoading() && map.loaded() && map.areTilesLoaded() && !map.isMoving();
  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const waitForIdle = (ms: number) => new Promise<boolean>(resolve => {
    const onIdle = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      map.off('idle', onIdle);
      resolve(false);
    }, ms);
    map.once('idle', onIdle);
    // 'idle' only fires after a render, so ask for one in case the map is already idle.
    map.triggerRepaint();
  });

  let emptySince: number | null = null;
  while (Date.now() < deadline) {
    if (hasFailedData()) throw new MapExportBlockedError('failed-networks');
    if (settled()) {
      const idle = await waitForIdle(Math.max(0, deadline - Date.now()));
      // Re-check: new data may have arrived (and started loading) while waiting.
      if (idle && settled()) {
        if (hasFailedData()) throw new MapExportBlockedError('failed-networks');
        if (hasRenderedRoutes()) return;
        // A view can briefly look empty right before newly requested data arrives.
        emptySince ??= Date.now();
        if (Date.now() - emptySince >= emptyGraceMs) throw new MapExportBlockedError('no-routes');
      } else {
        emptySince = null;
      }
    } else {
      emptySince = null;
    }
    await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
  throw new MapExportBlockedError('timeout');
}

/** File name for an export: lowercase letters, numbers and dashes only. */
export function mapExportFilename(name: string): string {
  const base = name.trim().replace(/\.png$/i, '');
  return `${slugifyForFilename(base) || 'atlas-map'}.png`;
}

export function downloadMapExport(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = mapExportFilename(filename);
  link.click();
  URL.revokeObjectURL(url);
}

/** Whether this browser can send a PNG to its native share sheet. */
export function canShareMapExport(): boolean {
  if (typeof navigator === 'undefined' || typeof File === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], 'atlas-map.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

/** Share the exported PNG through the device/browser's native share sheet. */
export async function shareMapExport(blob: Blob, title: string, filename: string = title): Promise<void> {
  if (!canShareMapExport()) throw new Error('This browser cannot share image files');
  const file = new File([blob], mapExportFilename(filename), { type: 'image/png' });
  await navigator.share({
    title: `${title.trim() || 'Transit map'} · Atlas`,
    text: 'Map exported from Atlas by Civic Minds',
    files: [file],
  });
}
