import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../apps/Interval', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('../apps/LiveVehicles', () => ({ default: () => null }));
vi.mock('../apps/History', () => ({ default: () => null }));
vi.mock('../apps/NightService', () => ({ default: () => null }));
vi.mock('../components/InfoPanel', () => ({ default: () => null }));
vi.mock('../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, live: false } };
});

import App from '../App';

describe('Live states have words, not silence', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/apps/live');
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0,
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ agencies: [] }) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Live switched off in a local copy says so and keeps the address, instead of redirecting', async () => {
    render(<BrowserRouter><App /></BrowserRouter>);
    expect(await screen.findByRole('heading', { name: /Live is switched off in this copy of Atlas/ })).toBeTruthy();
    expect(screen.getByText('npm run live')).toBeTruthy();
    expect(window.location.pathname).toBe('/apps/live');
  });

  it('no Live screen says "isn\'t available" or "not available" without a reason', () => {
    const roots = ['src/apps/LiveVehicles.tsx', 'src/components/Live'];
    const files: string[] = [];
    for (const r of roots) {
      if (r.endsWith('.tsx')) files.push(r);
      else for (const f of readdirSync(r)) if (f.endsWith('.tsx')) files.push(join(r, f));
    }
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toMatch(/isn['’]t available|not available|unavailable\./i);
  });
});
