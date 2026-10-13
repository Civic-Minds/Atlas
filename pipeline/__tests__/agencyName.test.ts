import { describe, expect, it } from 'vitest';
import { readConfigAgencyName, resolveAgencyName } from '../agencyName.js';

describe('resolveAgencyName (#785)', () => {
  it('explicit arg wins over config', () => {
    expect(resolveAgencyName('Given Name', 'ace', 'Altamont Corridor Express')).toBe('Given Name');
  });
  it('uses the config name when no arg', () => {
    expect(resolveAgencyName(undefined, 'ace', 'Altamont Corridor Express')).toBe('Altamont Corridor Express');
  });
  it('falls back to the slug with no arg and no config', () => {
    expect(resolveAgencyName(undefined, 'newslug', null)).toBe('newslug');
  });
  it('reads the real config file, and null for a missing one', () => {
    expect(readConfigAgencyName('ace')).toBe('Altamont Corridor Express');
    expect(readConfigAgencyName('no-such-agency-zzz')).toBeNull();
  });
});
