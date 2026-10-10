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

/** What the image says about the view. Every field comes from the map's own state. */
export interface MapExportText {
  /** Large heading, usually the place in view (e.g. "Toronto"). */
  title: string;
  /** Smaller lines under the heading: view name, route, filter. */
  lines?: string[];
  /** Colour key, only the colours actually drawn on the map. */
  key?: MapExportKeyEntry[];
  /** Small heading above the key, e.g. "Frequency". */
  keyTitle?: string;
}

interface MapExportOptions extends MapExportText {
  source: HTMLCanvasElement;
  lightMode: boolean;
  size?: MapExportSize;
}

const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';
const TITLE_FONT = (s: number) => `800 ${27 * s}px ${FONT}`;
const LINE_FONT = (s: number) => `600 ${14 * s}px ${FONT}`;
const KEY_FONT = (s: number) => `600 ${12 * s}px ${FONT}`;
const KEY_TITLE_FONT = (s: number) => `700 ${11 * s}px ${FONT}`;

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
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

export interface MapExportLayout {
  width: number;
  height: number;
  /** Text and margin scale relative to the standard 1600px layout. */
  scale: number;
  headerHeight: number;
  footerHeight: number;
  /** Portrait exports stack the footer text on two lines so it fits a narrow image. */
  stackedFooter: boolean;
  /** Part of the source canvas that is drawn (in source pixels). */
  sourceRect: { x: number; y: number; width: number; height: number };
  /** Where that part lands in the export (in export pixels). */
  mapRect: { x: number; y: number; width: number; height: number };
}

/** Text scale for an export: the preset's scale, kept readable on a narrow phone image. */
export function getMapExportTextScale(sourceWidth: number, sourceHeight: number, size: MapExportSize = DEFAULT_MAP_EXPORT_SIZE): number {
  const scale = size.width / DEFAULT_MAP_EXPORT_SIZE.width;
  if (sourceWidth >= sourceHeight) return scale;
  // A portrait image is never wider than the screen, so cap text by the screen's own width.
  return Math.min(scale, sourceWidth / 520);
}

/** Header height for a title plus this many description lines. */
function headerHeightFor(lineCount: number, scale: number): number {
  return Math.round((lineCount > 0 ? 62 + lineCount * 20 : 72) * scale);
}

/**
 * Work out the export image size and how the map is placed in it.
 *
 * Landscape screens keep the fixed preset size (a light centre crop to the preset's
 * shape). Portrait screens (phones) keep the screen's own shape instead: the whole
 * visible map is used, nothing is cropped, and the map is never drawn larger than
 * the screen's real pixels, so it is never stretched or blurred.
 *
 * `lineCount` is the number of description lines under the title once wrapped
 * (see measureMapExportLines), so the header always fits its text.
 */
export function getMapExportLayout(sourceWidth: number, sourceHeight: number, size: MapExportSize = DEFAULT_MAP_EXPORT_SIZE, lineCount = 0): MapExportLayout {
  const scale = getMapExportTextScale(sourceWidth, sourceHeight, size);
  const headerHeight = headerHeightFor(lineCount, scale);

  if (sourceWidth >= sourceHeight) {
    const footerHeight = Math.round(38 * scale);
    const mapRect = { x: 0, y: headerHeight, width: size.width, height: size.height - headerHeight - footerHeight };
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

  // Portrait: the preset's long edge becomes the image height.
  const footerHeight = Math.round(56 * scale);
  const mapHeight = Math.min(size.width - headerHeight - footerHeight, sourceHeight);
  const mapWidth = Math.min(sourceWidth, Math.round(mapHeight * (sourceWidth / sourceHeight)));
  return {
    width: mapWidth,
    height: headerHeight + mapHeight + footerHeight,
    scale,
    headerHeight,
    footerHeight,
    stackedFooter: true,
    sourceRect: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    mapRect: { x: 0, y: headerHeight, width: mapWidth, height: mapHeight },
  };
}

/** Image width an export will have, before the header is measured. */
function exportWidth(sourceWidth: number, sourceHeight: number, size: MapExportSize): number {
  return getMapExportLayout(sourceWidth, sourceHeight, size, 0).width;
}

/**
 * Wrap the description lines for this export size. Uses a canvas to measure text; when no
 * canvas is available (tests), lines are kept unwrapped.
 */
export function measureMapExportLines(
  lines: string[],
  sourceWidth: number,
  sourceHeight: number,
  size: MapExportSize = DEFAULT_MAP_EXPORT_SIZE,
  context?: CanvasRenderingContext2D | null,
): string[] {
  if (lines.length === 0) return [];
  const ctx = context ?? (typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null);
  if (!ctx) return lines;
  const scale = getMapExportTextScale(sourceWidth, sourceHeight, size);
  // The width only shrinks a little as the header grows, so measure against the narrowest case.
  const width = Math.min(
    exportWidth(sourceWidth, sourceHeight, size),
    getMapExportLayout(sourceWidth, sourceHeight, size, lines.length * 3).width,
  );
  const maxWidth = width - 2 * 28 * scale;
  ctx.font = LINE_FONT(scale);
  return lines.flatMap(line => wrapExportLine(text => ctx.measureText(text).width, line, maxWidth));
}

/** Output size of an export, including the header lines this view needs. */
export function getMapExportOutputSize(sourceWidth: number, sourceHeight: number, size: MapExportSize, lines: string[] = []): { width: number; height: number } {
  const wrapped = measureMapExportLines(lines, sourceWidth, sourceHeight, size);
  const layout = getMapExportLayout(sourceWidth, sourceHeight, size, wrapped.length);
  return { width: layout.width, height: layout.height };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fill();
}

/**
 * Draw the colour key as a small card in the map's bottom-left corner, laid out like the
 * app's own legend (three columns).
 */
function drawKey(
  context: CanvasRenderingContext2D,
  key: MapExportKeyEntry[],
  keyTitle: string | undefined,
  mapRect: MapExportLayout['mapRect'],
  scale: number,
  colors: { foreground: string; muted: string; panel: string; border: string },
) {
  if (key.length === 0) return;
  const pad = 12 * scale;
  const swatchWidth = 18 * scale;
  const swatchHeight = 5 * scale;
  const gap = 6 * scale;
  const columnGap = 14 * scale;
  const rowHeight = 18 * scale;
  const titleHeight = keyTitle ? 18 * scale : 0;
  const margin = 16 * scale;

  context.font = KEY_FONT(scale);
  const labelWidth = Math.max(...key.map(item => context.measureText(item.label).width));
  const cellWidth = swatchWidth + gap + labelWidth;
  const maxCardWidth = mapRect.width - margin * 2;
  const columns = Math.max(1, Math.min(3, key.length, Math.floor((maxCardWidth - pad * 2 + columnGap) / (cellWidth + columnGap))));
  const rows = Math.ceil(key.length / columns);
  const cardWidth = pad * 2 + columns * cellWidth + (columns - 1) * columnGap;
  const cardHeight = pad * 2 + titleHeight + rows * rowHeight - (rowHeight - 12 * scale);
  const x = mapRect.x + margin;
  const y = mapRect.y + mapRect.height - margin - cardHeight;

  context.fillStyle = colors.border;
  roundedRect(context, x - scale, y - scale, cardWidth + 2 * scale, cardHeight + 2 * scale, 11 * scale);
  context.fillStyle = colors.panel;
  roundedRect(context, x, y, cardWidth, cardHeight, 10 * scale);

  context.textBaseline = 'middle';
  context.textAlign = 'left';
  if (keyTitle) {
    context.fillStyle = colors.muted;
    context.font = KEY_TITLE_FONT(scale);
    context.fillText(keyTitle, x + pad, y + pad + 6 * scale);
  }
  context.font = KEY_FONT(scale);
  key.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = x + pad + column * (cellWidth + columnGap);
    const cellY = y + pad + titleHeight + row * rowHeight + 6 * scale;
    context.fillStyle = item.color;
    roundedRect(context, cellX, cellY - swatchHeight / 2, swatchWidth, swatchHeight, swatchHeight / 2);
    context.fillStyle = colors.foreground;
    context.fillText(item.label, cellX + swatchWidth + gap, cellY);
  });
}

/** Compose the rendered map into a shareable, branded image. */
export async function createMapExport({ source, title, lines = [], key = [], keyTitle, lightMode, size = DEFAULT_MAP_EXPORT_SIZE }: MapExportOptions): Promise<Blob> {
  if (source.width === 0 || source.height === 0) {
    throw new Error('The map is not ready to export');
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the export image');
  const wrappedLines = measureMapExportLines(lines, source.width, source.height, size, context);
  const layout = getMapExportLayout(source.width, source.height, size, wrappedLines.length);
  canvas.width = layout.width;
  canvas.height = layout.height;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const colors = lightMode
    ? { background: '#f8fafc', foreground: '#18181b', muted: '#52525b', panel: 'rgba(255, 255, 255, 0.94)', border: 'rgba(24, 24, 27, 0.12)' }
    : { background: '#111113', foreground: '#f4f4f5', muted: '#d4d4d8', panel: 'rgba(17, 17, 19, 0.94)', border: 'rgba(244, 244, 245, 0.16)' };
  const { scale, headerHeight, footerHeight, sourceRect, mapRect } = layout;
  const margin = 28 * scale;
  const textWidth = canvas.width - margin * 2;

  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, mapRect.x, mapRect.y, mapRect.width, mapRect.height);

  context.fillStyle = colors.panel;
  context.fillRect(0, 0, canvas.width, headerHeight);
  context.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);

  context.fillStyle = colors.foreground;
  context.font = TITLE_FONT(scale);
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillText(fitText(context, title.trim() || 'Transit map', textWidth), margin, 34 * scale);

  context.fillStyle = colors.muted;
  context.font = LINE_FONT(scale);
  if (wrappedLines.length > 0) {
    wrappedLines.forEach((line, index) => context.fillText(line, margin, (64 + index * 20) * scale));
  } else {
    context.fillText('Atlas by Civic Minds', margin, 57 * scale);
  }

  drawKey(context, key, keyTitle, mapRect, scale, colors);

  const brand = 'Atlas by Civic Minds · transitatlas.fyi';
  const credit = 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';
  context.textAlign = 'left';
  if (layout.stackedFooter) {
    context.fillStyle = colors.foreground;
    context.font = `800 ${13 * scale}px ${FONT}`;
    context.fillText(fitText(context, brand, textWidth), margin, canvas.height - footerHeight + 20 * scale);
    context.fillStyle = colors.muted;
    context.font = `500 ${10 * scale}px ${FONT}`;
    context.fillText(fitText(context, credit, textWidth), margin, canvas.height - footerHeight + 39 * scale);
  } else {
    context.textAlign = 'right';
    context.fillStyle = colors.foreground;
    context.font = `800 ${13 * scale}px ${FONT}`;
    context.fillText(brand, canvas.width - margin, canvas.height - 19 * scale);
    context.textAlign = 'left';
    context.fillStyle = colors.muted;
    context.font = `500 ${10 * scale}px ${FONT}`;
    context.fillText(credit, margin, canvas.height - 19 * scale);
  }

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
