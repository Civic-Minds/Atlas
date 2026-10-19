import { Plus, Minus } from 'lucide-react';

/** The zoom in / zoom out pair the maps share, so every map's controls look and sit the same. */
export default function MapZoomButtons({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <div className="flex flex-col rounded-full bg-[var(--bg-panel)] border border-[var(--border-primary)] shadow-lg backdrop-blur-md overflow-hidden">
      <button
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] border-b border-[var(--border-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="w-8 h-8 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
