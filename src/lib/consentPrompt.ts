import { useSyncExternalStore } from 'react';
import type { AnalyticsConsent } from './analytics';

/**
 * Shared state for the analytics prompt (#999). AnalyticsConsent owns the decision; the map's
 * bottom-left pill row (MapAttribution) registers itself and draws the prompt as its last pill on
 * sm and up, so it sits on that row's baseline by layout and wraps above it when the row is full.
 * Without a registered row (pages without the map) the prompt keeps its own fixed place.
 */
interface ConsentPromptState {
  open: boolean;
  rows: number;
  choose: (consent: AnalyticsConsent) => void;
}

let state: ConsentPromptState = { open: false, rows: 0, choose: () => {} };
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function setConsentPrompt(open: boolean, choose: (consent: AnalyticsConsent) => void): void {
  if (state.open === open && state.choose === choose) return;
  state = { ...state, open, choose };
  emit();
}

/** Called by a pill row on mount; returns the unregister function. */
export function registerConsentRow(): () => void {
  state = { ...state, rows: state.rows + 1 };
  emit();
  return () => { state = { ...state, rows: Math.max(0, state.rows - 1) }; emit(); };
}

export function useConsentPrompt(): ConsentPromptState {
  return useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => state,
    () => state,
  );
}
