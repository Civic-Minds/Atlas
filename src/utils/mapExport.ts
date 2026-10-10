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

interface MapExportOptions {
  source: HTMLCanvasElement;
  title: string;
  lightMode: boolean;
  size?: MapExportSize;
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
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

/**
 * Work out the export image size and how the map is placed in it.
 *
 * Landscape screens keep the fixed preset size (a light centre crop to the preset's
 * shape). Portrait screens (phones) keep the screen's own shape instead: the whole
 * visible map is used, nothing is cropped, and the map is never drawn larger than
 * the screen's real pixels, so it is never stretched or blurred.
 */
export function getMapExportLayout(sourceWidth: number, sourceHeight: number, size: MapExportSize = DEFAULT_MAP_EXPORT_SIZE): MapExportLayout {
  const scale = size.width / DEFAULT_MAP_EXPORT_SIZE.width;
  const headerHeight = Math.round(72 * scale);

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

/** Compose the rendered map into a shareable, branded image. */
export async function createMapExport({ source, title, lightMode, size = DEFAULT_MAP_EXPORT_SIZE }: MapExportOptions): Promise<Blob> {
  if (source.width === 0 || source.height === 0) {
    throw new Error('The map is not ready to export');
  }

  const layout = getMapExportLayout(source.width, source.height, size);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the export image');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const colors = lightMode
    ? { background: '#f8fafc', foreground: '#18181b', muted: '#52525b', panel: 'rgba(255, 255, 255, 0.94)' }
    : { background: '#111113', foreground: '#f4f4f5', muted: '#d4d4d8', panel: 'rgba(17, 17, 19, 0.94)' };
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
  context.font = `800 ${27 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
  context.textBaseline = 'middle';
  context.fillText(fitText(context, title.trim() || 'Transit map', Math.min(830 * scale, textWidth)), margin, 30 * scale);

  context.fillStyle = colors.muted;
  context.font = `600 ${13 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
  context.fillText('Atlas by Civic Minds', margin, 53 * scale);

  const brand = 'Atlas by Civic Minds · transitatlas.fyi';
  const credit = 'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';
  if (layout.stackedFooter) {
    context.fillStyle = colors.foreground;
    context.font = `800 ${13 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.fillText(fitText(context, brand, textWidth), margin, canvas.height - footerHeight + 20 * scale);
    context.fillStyle = colors.muted;
    context.font = `500 ${10 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.fillText(fitText(context, credit, textWidth), margin, canvas.height - footerHeight + 39 * scale);
  } else {
    context.textAlign = 'right';
    context.fillStyle = colors.foreground;
    context.font = `800 ${13 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
    context.fillText(brand, canvas.width - margin, canvas.height - 19 * scale);
    context.textAlign = 'left';
    context.fillStyle = colors.muted;
    context.font = `500 ${10 * scale}px Inter, ui-sans-serif, system-ui, sans-serif`;
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

export function downloadMapExport(blob: Blob, title: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'atlas-map';
  link.href = url;
  link.download = `${slug}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

function mapExportFilename(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'atlas-map';
  return `${slug}.png`;
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
export async function shareMapExport(blob: Blob, title: string): Promise<void> {
  if (!canShareMapExport()) throw new Error('This browser cannot share image files');
  const file = new File([blob], mapExportFilename(title), { type: 'image/png' });
  await navigator.share({
    title: `${title.trim() || 'Transit map'} · Atlas`,
    text: 'Map exported from Atlas by Civic Minds',
    files: [file],
  });
}
