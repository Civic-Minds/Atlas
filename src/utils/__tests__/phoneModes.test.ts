import { describe, it, expect } from 'vitest';
import { isAppGated } from '../appGate';
import { phoneModeFlags } from '../../hooks/useMediaQuery';

const on = { live: true, history: true, researchApps: true };

describe('phone mode gating', () => {
  it('switches History and Compare off below sm only', () => {
    expect(phoneModeFlags(true)).toEqual({ history: false, compareMode: false });
    expect(phoneModeFlags(false)).toEqual({ history: true, compareMode: true });
  });

  it('sends a phone deep link to /apps/history back to the map, and leaves desktop alone', () => {
    expect(isAppGated('history', { ...on, history: on.history && phoneModeFlags(true).history })).toBe(true);
    expect(isAppGated('history', { ...on, history: on.history && phoneModeFlags(false).history })).toBe(false);
    expect(isAppGated('frequency', { ...on, history: false })).toBe(false);
  });
});
