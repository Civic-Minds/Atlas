import { afterEach, describe, expect, it } from 'vitest';
import { resetUmamiPageviewPath, shouldLoadUmami, umamiBeforeSend } from '../umami';

afterEach(() => { window.localStorage.clear(); window.history.replaceState({}, '', '/'); resetUmamiPageviewPath(); });

describe('Umami (CIV-2023)', () => {
  it('loads only on a production public build', () => {
    expect(shouldLoadUmami(true, 'public', false)).toBe(true);
    expect(shouldLoadUmami(true, 'beta', false)).toBe(false);
    expect(shouldLoadUmami(false, 'public', false)).toBe(false);
  });

  it('never loads for internal visits (?atlas_internal=1 or localhost)', () => {
    expect(shouldLoadUmami(true, 'public', true)).toBe(false);
    window.history.replaceState({}, '', '/?atlas_internal=1');
    expect(shouldLoadUmami(true, 'public')).toBe(false);
  });

  it('sends the address without the map position (#1519)', () => {
    expect(umamiBeforeSend('event', { url: '/?lat=43.6&lon=-79.4&z=12&route=29' })).toEqual({ url: '/?z=12&route=29' });
    expect(umamiBeforeSend('event', { name: 'x' })).toEqual({ name: 'x' });
  });

  it('counts one page view per page, not one per map pan or filter change', () => {
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/?utm_source=x&z=11' })).toEqual({ url: '/?utm_source=x&z=11' });
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/?lat=1&lon=2&z=12' })).toBe(false);
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/?p=midday&z=12' })).toBe(false);
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/?p=midday', name: 'filter_changed' })).toEqual({ url: '/?p=midday', name: 'filter_changed' });
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/about' })).toEqual({ url: '/about' });
    expect(umamiBeforeSend('event', { url: 'https://transitatlas.fyi/?z=10' })).toEqual({ url: '/?z=10' });
  });
});
