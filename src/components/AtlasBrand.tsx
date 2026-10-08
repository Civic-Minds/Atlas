import { Map as MapIcon } from 'lucide-react';

export default function AtlasBrand({ showMark = false }: { showMark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {showMark && <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />}
      <span className="flex flex-col leading-tight">
        <span className="text-xs sm:text-sm font-black text-[var(--text-primary)]">Atlas</span>
        <span className="text-[8px] sm:text-[10px] text-[var(--text-dim)]">by Civic Minds</span>
      </span>
    </span>
  );
}
