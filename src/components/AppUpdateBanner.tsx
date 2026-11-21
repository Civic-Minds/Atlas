import { RefreshCw } from 'lucide-react';
import { MAP_BADGE, MAP_PROMPT_SLOT, Z_HEADER } from '../styles';
import { useAppUpdate } from '../utils/appUpdate';
import { usePromptFlag } from '../hooks/usePromptFlag';
import { UPDATE_AVAILABLE_NOTICE } from '../content/noticeCopy';

export default function AppUpdateBanner() {
  const updateAvailable = useAppUpdate(true);
  usePromptFlag(updateAvailable);
  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-map-overlay="update-banner"
      className={`${MAP_PROMPT_SLOT} h-8 max-sm:h-[32px] ${Z_HEADER} ${MAP_BADGE} gap-3 text-xs font-bold text-[var(--text-muted)]`}
    >
      <span>{UPDATE_AVAILABLE_NOTICE}</span>
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
