import { Map as MapIcon } from 'lucide-react';

/** page: the larger wordmark used in the content-page header, sized against its nav links. */
export default function AtlasBrand({ showMark = false, size = 'compact', hideByline = false }: { showMark?: boolean; size?: 'compact' | 'page'; hideByline?: boolean }) {
  const page = size === 'page';
  return (
    <span className="inline-flex items-center gap-2">
      {showMark && <MapIcon className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />}
      <span className="flex flex-col gap-px">
        <span className={`${page ? 'text-lg' : 'text-xs sm:text-sm'} leading-none font-black text-[var(--text-primary)]`}>Atlas</span>
        <span className={`${page ? 'text-[13px] leading-none text-[var(--text-muted)]' : 'text-2xs leading-none text-[var(--text-dim)]'} ${hideByline ? 'hidden sm:block' : ''}`}>by Civic Minds</span>
      </span>
    </span>
  );
}
