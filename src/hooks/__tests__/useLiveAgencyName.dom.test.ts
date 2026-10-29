import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../useAgencies', () => ({
  useAgencies: () => ({ agencies: [{ slug: 'ttc', name: 'Toronto Transit Commission' }, { slug: 'capmetro', name: 'Capital Metropolitan Transportation Authority' }], agenciesLoadState: 'ready' }),
}));

import { useLiveAgencyName } from '../useLiveAgencyName';
import { agencyNames } from '../../utils/agencyName';

// CIV-1117: Live titles and back links name the agency as the map's cards do, never an upper-cased slug.
describe('useLiveAgencyName', () => {
  it('gives the registry short name', () => {
    expect(renderHook(() => useLiveAgencyName('ttc')).result.current).toBe(agencyNames('Toronto Transit Commission').name);
    expect(renderHook(() => useLiveAgencyName('capmetro')).result.current).toBe(agencyNames('Capital Metropolitan Transportation Authority').name);
  });
  it('falls back to the slug as written, not upper-cased', () => {
    expect(renderHook(() => useLiveAgencyName('zzz')).result.current).toBe('zzz');
  });
});
