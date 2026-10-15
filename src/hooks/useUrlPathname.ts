import { useSyncExternalStore } from 'react';

// The router applies navigations inside a React transition, so the page can keep showing the old
// mode for seconds after the address changed (leaving Live re-renders the whole frequency map).
// This store follows the address itself and updates urgently, so a mode can switch itself off the
// moment its URL is gone (CIV-214).
const EVENT = 'atlas:urlchange';
let patched = false;

function patchHistory() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      window.dispatchEvent(new Event(EVENT));
    };
  }
}

function subscribe(onChange: () => void) {
  patchHistory();
  window.addEventListener('popstate', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The address bar's pathname, updated as soon as it changes (not inside the router's transition). */
export function useUrlPathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => '/');
}
