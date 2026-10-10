import React, { useEffect, useRef, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { FLOATING_CARD, Z_MODAL_BG, Z_MODAL_TOP } from '../styles';
import { canShareMapExport, createMapExport, DEFAULT_MAP_EXPORT_SIZE, downloadMapExport, getMapExportLayout, getMapExportOutputSize, MAP_EXPORT_SIZES, measureMapExportLines, MapExportBlockedError, shareMapExport, type MapExportSize, type MapExportSizeId } from '../utils/mapExport';
import type { MapExportBox, MapExportDetails } from '../utils/mapExportDetails';

interface Props {
  open: boolean;
  /** Size of the map canvas in device pixels, used to show the real output size. */
  sourceSize: { width: number; height: number } | null;
  /** Resolves with the map canvas once the current view has fully loaded and drawn. */
  prepareSource: () => Promise<HTMLCanvasElement>;
  /** Describes the view as drawn right now: place, filter, colour key and file name. */
  describe: (box?: MapExportBox) => MapExportDetails;
  lightMode: boolean;
  onClose: () => void;
}

export default function MapExportDialog({ open, sourceSize, prepareSource, describe, lightMode, onClose }: Props) {
  const [exportingMode, setExportingMode] = useState<'download' | 'share' | null>(null);
  const [waitingForMap, setWaitingForMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareSupported, setShareSupported] = useState(false);
  const [selectedSizeId, setSelectedSizeId] = useState<MapExportSizeId>(DEFAULT_MAP_EXPORT_SIZE.id);

  const openRef = useRef(open);
  openRef.current = open;

  const [previewLines, setPreviewLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setShareSupported(canShareMapExport());
    // Header lines change the image height on phones, so size the preview with them.
    try {
      setPreviewLines(describe().lines);
    } catch {
      setPreviewLines([]);
    }
  }, [open, describe]);

  if (!open) return null;

  const selectedSize: MapExportSize = MAP_EXPORT_SIZES.find(candidate => candidate.id === selectedSizeId) ?? DEFAULT_MAP_EXPORT_SIZE;
  const outputSize = (size: MapExportSize) => {
    if (!sourceSize || sourceSize.width === 0 || sourceSize.height === 0) return size;
    return getMapExportOutputSize(sourceSize.width, sourceSize.height, size, previewLines);
  };
  const selectedOutput = outputSize(selectedSize);

  const handleExport = async (mode: 'download' | 'share') => {
    if (exportingMode) return;
    setExportingMode(mode);
    setError(null);
    try {
      const size = MAP_EXPORT_SIZES.find(candidate => candidate.id === selectedSizeId) ?? DEFAULT_MAP_EXPORT_SIZE;
      // Never export a half-loaded map: wait until every route for this view is drawn.
      setWaitingForMap(true);
      let source: HTMLCanvasElement;
      try {
        source = await prepareSource();
      } finally {
        setWaitingForMap(false);
      }
      // The dialog was closed while waiting; do not save anything unexpectedly.
      if (!openRef.current) return;
      // Describe the view only now that every route is drawn, so the text and key match the image.
      // Landscape exports crop the screen to the preset's shape: describe only what stays in.
      const layout = getMapExportLayout(source.width, source.height, size, measureMapExportLines(describe().lines, source.width, source.height, size).length);
      const pixelRatio = source.clientWidth > 0 ? source.width / source.clientWidth : 1;
      const { x, y, width, height } = layout.sourceRect;
      const details = describe([[x / pixelRatio, y / pixelRatio], [(x + width) / pixelRatio, (y + height) / pixelRatio]]);
      const blob = await createMapExport({
        source,
        title: details.place,
        lines: details.lines,
        key: details.key,
        keyTitle: details.keyTitle,
        lightMode,
        size,
      });
      if (mode === 'share') {
        await shareMapExport(blob, details.place, details.filename);
      } else {
        downloadMapExport(blob, details.filename);
      }
      onClose();
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setError(shareError instanceof MapExportBlockedError ? shareError.message : 'The map was not ready. Try again in a moment.');
    } finally {
      setExportingMode(null);
    }
  };

  return (
    <div
      className={`fixed inset-0 ${Z_MODAL_BG} flex items-center justify-center bg-black/35 px-4`}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-export-title"
        className={`${FLOATING_CARD} ${Z_MODAL_TOP} w-full max-w-md p-5`}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="map-export-title" className="text-sm font-black text-[var(--text-primary)]">Export map image</h2>
            <p className="mt-1 text-[11px] font-bold text-[var(--text-dim)]">{selectedOutput.width} × {selectedOutput.height} PNG with Atlas attribution.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close export dialog" className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {waitingForMap && <p role="status" className="mt-2 text-[11px] font-bold text-[var(--text-dim)]">Map still loading. The image will save once every route is drawn.</p>}
        {error && <p role="alert" className="mt-2 text-[11px] font-bold text-red-500">{error}</p>}

        <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-[var(--border-primary)] p-1">
          {MAP_EXPORT_SIZES.map(size => (
            <button
              key={size.id}
              type="button"
              onClick={() => setSelectedSizeId(size.id)}
              aria-pressed={selectedSizeId === size.id}
              className={`rounded-lg px-2 py-2 text-[10px] font-black transition-colors ${selectedSizeId === size.id ? 'bg-[var(--accent-bg)] text-[var(--accent)]' : 'text-[var(--text-dim)] hover:bg-[var(--bg-btn-hover)] hover:text-[var(--text-primary)]'}`}
            >
              <span className="block">{size.label}</span>
              <span className="mt-0.5 block text-[9px] font-bold opacity-75">{outputSize(size).width} × {outputSize(size).height}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleExport('download')}
            disabled={!!exportingMode}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border-primary)] px-3.5 py-2 text-xs font-black text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingMode === 'download' ? (waitingForMap ? 'Map still loading…' : 'Preparing download…') : 'Download PNG'}
          </button>
          {shareSupported && (
            <button
              type="button"
              onClick={() => void handleExport('share')}
              disabled={!!exportingMode}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-primary)] px-3.5 py-2 text-xs font-black text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              {exportingMode === 'share' ? (waitingForMap ? 'Map still loading…' : 'Preparing share…') : 'Share image'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
