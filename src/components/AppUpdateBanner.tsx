import { RefreshCw } from 'lucide-react';
import { PILL_SURFACE, Z_HEADER } from '../styles';
import { useAppUpdate } from '../utils/appUpdate';

export default function AppUpdateBanner() {
  const update = useAppUpdate(true);
  if (!update.deployment && !update.data) return null;

  const message = update.deployment && update.data
    ? 'A new app version and schedule data are available.'
    : update.deployment
      ? 'A new app version is available.'
      : 'New schedule data is available.';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-[4.5rem] left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2 ${Z_HEADER} ${PILL_SURFACE} gap-3 px-3 text-[10px] font-bold text-[var(--text-muted)]`}
    >
      <span className="truncate">{message} Refresh to update.</span>
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
