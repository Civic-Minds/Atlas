import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import DevHint from '../DevHint';
import { devHintsOn } from '../../../lib/devHints';

const store = new Map<string, string>();
beforeEach(() => { store.clear(); vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } }); });
afterEach(() => { window.history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

describe('developer hints', () => {
  it('are off by default, even in a dev build', () => {
    expect(devHintsOn()).toBe(false);
    expect(render(<DevHint hint="npm run live:analyze" />).container.textContent).toBe('');
  });
  it('turn on with ?dev=1', () => {
    window.history.replaceState(null, '', '/?dev=1');
    expect(render(<DevHint hint="npm run live:analyze" />).container.textContent).toBe('Dev: npm run live:analyze');
  });
  it('turn on with localStorage atlas.devHints = 1', () => {
    window.localStorage.setItem('atlas.devHints', '1');
    expect(devHintsOn()).toBe(true);
  });
  it('stay off for any other value', () => {
    window.history.replaceState(null, '', '/?dev=0');
    window.localStorage.setItem('atlas.devHints', '0');
    expect(devHintsOn()).toBe(false);
  });
});
