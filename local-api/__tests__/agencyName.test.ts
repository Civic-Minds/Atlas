import { describe, expect, it } from 'vitest';
import { liveAgencyName } from '../agencyName';

// CIV-1117: the Live API names an agency as Live's titles do: the registry short name, never an upper-cased slug.
describe('liveAgencyName', () => {
  it('reads the short name from the agency registry', async () => {
    expect(await liveAgencyName('ttc')).toBe('TTC');
    expect(await liveAgencyName('TTC')).toBe('TTC');
  });
  it('keeps a slug the registry does not list as written', async () => {
    expect(await liveAgencyName('zzz')).toBe('zzz');
    expect(await liveAgencyName('../package')).toBe('../package');
  });
});
