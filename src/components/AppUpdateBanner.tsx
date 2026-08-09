import { RefreshCw } from 'lucide-react';
import { SURFACE, Z_HEADER } from '../styles';
import { useAppUpdate } from '../utils/appUpdate';

export default function AppUpdateBanner() {
  const updateAvailable = useAppUpdate(true);
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-[4.5rem] left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 ${Z_HEADER} ${SURFACE} flex items-center justify-between gap-3 rounded-full px-3 py-1.5 text-[10px] font-bold text-[var(--text-muted)] shadow-lg`}
    >
      <span>This page is out of date. Refresh to update.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex shrink-0 items-center gap-1 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}
