export const MAP_EXPORT_WIDTH = 1200;
export const MAP_EXPORT_HEIGHT = 630;

interface MapExportOptions {
  source: HTMLCanvasElement;
  title: string;
  lightMode: boolean;
}

function fitSourceCanvas(
  context: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const sourceRatio = source.width / source.height;
  const targetRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = source.width;
  let sourceHeight = source.height;

  if (sourceRatio > targetRatio) {
    sourceWidth = source.height * targetRatio;
    sourceX = (source.width - sourceWidth) / 2;
  } else {
    sourceHeight = source.width / targetRatio;
    sourceY = (source.height - sourceHeight) / 2;
  }

  context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
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

/** Compose the rendered map into a shareable, branded landscape image. */
export async function createMapExport({ source, title, lightMode }: MapExportOptions): Promise<Blob> {
  if (source.width === 0 || source.height === 0) {
    throw new Error('The map is not ready to export');
  }

  const canvas = document.createElement('canvas');
  canvas.width = MAP_EXPORT_WIDTH;
  canvas.height = MAP_EXPORT_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not prepare the export image');

  const colors = lightMode
    ? { background: '#f8fafc', foreground: '#18181b', muted: '#52525b', panel: 'rgba(255, 255, 255, 0.94)' }
    : { background: '#111113', foreground: '#f4f4f5', muted: '#d4d4d8', panel: 'rgba(17, 17, 19, 0.94)' };
  const headerHeight = 72;
  const footerHeight = 38;

  context.fillStyle = colors.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  fitSourceCanvas(context, source, 0, headerHeight, canvas.width, canvas.height - headerHeight - footerHeight);

  context.fillStyle = colors.panel;
  context.fillRect(0, 0, canvas.width, headerHeight);
  context.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);

  context.fillStyle = colors.foreground;
  context.font = '800 27px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textBaseline = 'middle';
  context.fillText(fitText(context, title.trim() || 'Transit map', 830), 28, 30);

  context.fillStyle = colors.muted;
  context.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('Atlas by Civic Minds', 28, 53);

  context.textAlign = 'right';
  context.fillStyle = colors.foreground;
  context.font = '800 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('transitatlas.fyi', canvas.width - 28, canvas.height - 19);
  context.textAlign = 'left';
  context.fillStyle = colors.muted;
  context.font = '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.fillText('Map tiles by CARTO · Data by OpenStreetMap · Current Atlas view', 28, canvas.height - 19);

  return canvasToBlob(canvas);
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
