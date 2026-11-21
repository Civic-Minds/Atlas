import { useEffect } from 'react';
import { Z_HEADER, MAP_CONSENT_SLOT } from '../styles';
import { setSlowPrompt, useConsentPrompt } from '../lib/consentPrompt';
import { MapPromptPill } from './AnalyticsConsent';
import { SLOW_CONNECTION_ACCEPT, SLOW_CONNECTION_DECLINE, SLOW_CONNECTION_PROMPT } from '../content/noticeCopy';

const ANSWERED_KEY = 'atlas_slow_connection_answered';

export function readSlowPromptAnswered(): boolean {
  try { return sessionStorage.getItem(ANSWERED_KEY) === 'true'; } catch { return false; }
}

export function rememberSlowPromptAnswered(): void {
  try { sessionStorage.setItem(ANSWERED_KEY, 'true'); } catch { /* the answer lasts only for this page then */ }
}

/** The prompt's pill: the fixed copy below, and a last pill of the map's bottom-left row (MapAttribution). */
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
 * CIV-98: offered, never applied silently. While it shows, the map already loads like Data saver. It sits where the
 * analytics prompt does (Ryan, 2026-11-20: "The same lace the analytics one goes right"): on sm and up the map's
 * bottom-left pill row draws it as a last pill; this fixed copy shows only on phones and on pages without that row.
 */
export default function SlowConnectionPrompt({ onAccept, onDecline }: { onAccept: () => void; onDecline: () => void }) {
  const { rows } = useConsentPrompt();
  useEffect(() => {
    setSlowPrompt(true, onAccept, onDecline);
    return () => setSlowPrompt(false, () => {}, () => {});
  }, [onAccept, onDecline]);
  return <SlowConnectionPill className={`${MAP_CONSENT_SLOT} ${rows > 0 ? 'sm:hidden' : ''} max-w-[calc(100vw-2rem)] ${Z_HEADER}`} onAccept={onAccept} onDecline={onDecline} />;
}
