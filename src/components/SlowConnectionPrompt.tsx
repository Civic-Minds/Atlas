import { MAP_BADGE, Z_HEADER } from '../styles';
import { MAP_BANNER_SLOT } from '../mapOverlayLayout';
import { SLOW_CONNECTION_ACCEPT, SLOW_CONNECTION_DECLINE, SLOW_CONNECTION_PROMPT } from '../content/noticeCopy';

const ANSWERED_KEY = 'atlas_slow_connection_answered';

export function readSlowPromptAnswered(): boolean {
  try { return sessionStorage.getItem(ANSWERED_KEY) === 'true'; } catch { return false; }
}

export function rememberSlowPromptAnswered(): void {
  try { sessionStorage.setItem(ANSWERED_KEY, 'true'); } catch { /* the answer lasts only for this page then */ }
}

const BUTTON = 'shrink-0 transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]';

/** CIV-98: offered, never applied silently. While it shows, the map already loads like Data saver. Same slot and look as the update banner. */
export default function SlowConnectionPrompt({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-map-overlay="slow-connection-prompt"
      className={`${MAP_BANNER_SLOT} min-h-8 max-w-[calc(100vw-2rem)] ${Z_HEADER} ${MAP_BADGE} gap-3 text-xs font-bold text-[var(--text-muted)]`}
    >
      <span>{SLOW_CONNECTION_PROMPT}</span>
      <button type="button" onClick={onAccept} className={`${BUTTON} text-[var(--text-primary)]`}>{SLOW_CONNECTION_ACCEPT}</button>
      <button type="button" onClick={onDecline} className={BUTTON}>{SLOW_CONNECTION_DECLINE}</button>
    </div>
  );
}
