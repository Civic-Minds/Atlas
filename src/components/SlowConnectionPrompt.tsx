import { Z_HEADER, MAP_PROMPT_SLOT } from '../styles';
import { MapPromptPill } from './AnalyticsConsent';
import { usePromptFlag } from '../hooks/usePromptFlag';
import { SLOW_CONNECTION_ACCEPT, SLOW_CONNECTION_DECLINE, SLOW_CONNECTION_PROMPT } from '../content/noticeCopy';

const ANSWERED_KEY = 'atlas_slow_connection_answered';

export function readSlowPromptAnswered(): boolean {
  try { return sessionStorage.getItem(ANSWERED_KEY) === 'true'; } catch { return false; }
}

export function rememberSlowPromptAnswered(): void {
  try { sessionStorage.setItem(ANSWERED_KEY, 'true'); } catch { /* the answer lasts only for this page then */ }
}

/** The prompt's pill (the analytics prompt's shared MapPromptPill). */
export function SlowConnectionPill({ className = '', onAccept, onDecline }: { className?: string; onAccept: () => void; onDecline: () => void }) {
  return (
    <MapPromptPill
      role="status"
      wrapOnPhones
      className={className}
      label={SLOW_CONNECTION_PROMPT}
      message={SLOW_CONNECTION_PROMPT}
      actions={[{ label: SLOW_CONNECTION_ACCEPT, onClick: onAccept }, { label: SLOW_CONNECTION_DECLINE, onClick: onDecline }]}
    />
  );
}

/**
 * CIV-98: offered, never applied silently. While it shows, the map already loads like Data saver.
 * CIV-2004 (Ryan chose 1): in the prompts' one centred slot (MAP_PROMPT_SLOT), as the analytics prompt and the update notice.
 */
export default function SlowConnectionPrompt({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  usePromptFlag(true);
  return <SlowConnectionPill className={`${MAP_PROMPT_SLOT} ${Z_HEADER}`} onAccept={onAccept} onDecline={onDecline} />;
}
