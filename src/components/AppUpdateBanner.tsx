import { RefreshCw } from 'lucide-react';
import { MAP_BADGE, Z_HEADER } from '../styles';
import { useAppUpdate } from '../utils/appUpdate';

export default function AppUpdateBanner() {
  const updateAvailable = useAppUpdate(true);
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 left-1/2 h-8 max-w-[calc(100vw-2rem)] -translate-x-1/2 ${Z_HEADER} ${MAP_BADGE} gap-3 text-[10px] font-bold text-[var(--text-muted)]`}
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
