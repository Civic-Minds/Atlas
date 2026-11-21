import { Z_HEADER, MAP_CONSENT_SLOT } from '../styles';
import { MAP_BANNER_SLOT } from '../mapOverlayLayout';
import { MapPromptPill } from './AnalyticsConsent';
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
 * CIV-2004 (Ryan: "I thought the other ones were centered"): on sm and up it is centred in the update banner's slot, one
 * row above the notice pill (App shows one of the two at a time); phones keep it under the header, as the analytics prompt.
 */
export default function SlowConnectionPrompt({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  return (
    <>
      <SlowConnectionPill className={`${MAP_BANNER_SLOT} max-sm:hidden max-w-[calc(100vw-2rem)] ${Z_HEADER}`} onAccept={onAccept} onDecline={onDecline} />
      <SlowConnectionPill className={`${MAP_CONSENT_SLOT} sm:hidden max-w-[calc(100vw-2rem)] ${Z_HEADER}`} onAccept={onAccept} onDecline={onDecline} />
    </>
  );
}
