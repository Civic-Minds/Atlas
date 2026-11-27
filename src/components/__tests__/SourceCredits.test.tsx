import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import SourceCredits, { SourceCreditPage, useSourceCredits } from '../SourceCredits';
import { MASSDOT_CREDITED_SLUGS } from '../../../shared/liveArchiveFeeds';
import { MBTA_VEHICLES_CREDIT } from '../../content/noticeCopy';

const lic = (name: string, credit?: string) => ({ url: `https://example.org/${name}`, attribution: 'required' as const, checkedOn: '2026-11-21', name, ...(credit ? { credit } : {}) });
const agencies = [
  { slug: 'sto', name: 'STO (Gatineau)', dataLicense: lic('STO terms', 'Le présent service intègre les données.') },
  { slug: 'stlevis', name: 'STLévis', dataLicense: lic('CC BY 4.0') },
  { slug: 'mbta', name: 'Massachusetts Bay Transportation Authority', cities: ['Boston, MA'] },
];

describe('Schedule sources credits (CIV-461, CIV-3119)', () => {
  it("lists each agency's name as a row that opens its own page, not an inline dropdown", () => {
    const { result } = renderHook(() => useSourceCredits(agencies, false));
    const onOpen = vi.fn();
    render(<SourceCredits credits={result.current} onOpen={onOpen} />);
    const sto = screen.getByRole('button', { name: /^STO/ });
    expect(sto).not.toHaveAttribute('aria-expanded');
    fireEvent.click(sto);
    expect(onOpen).toHaveBeenCalledWith('sto');
    expect(screen.queryByText('Le présent service intègre les données.')).toBeNull();
    expect(screen.queryByRole('button', { name: /MBTA/ })).toBeNull();
  });

  it("an agency's page shows the licence, linked, and any words it requires", () => {
    const { result } = renderHook(() => useSourceCredits(agencies, false));
    render(<SourceCreditPage credit={result.current.find(c => c.slug === 'sto')!} />);
    expect(screen.getByRole('link', { name: /STO terms/ })).toHaveAttribute('href', 'https://example.org/STO terms');
    expect(screen.getByText('Le présent service intègre les données.')).toBeTruthy();
  });

  it("puts MassDOT's credit on MBTA's own row where Live is on", () => {
    expect(MASSDOT_CREDITED_SLUGS.has('mbta')).toBe(true);
    const { result } = renderHook(() => useSourceCredits(agencies, true));
    expect(result.current.map(c => c.label.primary)).toEqual(['MBTA', 'STLévis', 'STO']);
    render(<SourceCreditPage credit={result.current.find(c => c.slug === 'mbta')!} />);
    expect(screen.getByText(MBTA_VEHICLES_CREDIT)).toBeTruthy();
  });
});
