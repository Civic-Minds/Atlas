import { afterEach, describe, expect, it } from 'vitest';
import { shouldLoadUmami, umamiBeforeSend } from '../umami';

afterEach(() => { window.localStorage.clear(); window.history.replaceState({}, '', '/'); });

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
});
