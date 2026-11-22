import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SourceCredits from '../SourceCredits';
import { MASSDOT_CREDITED_SLUGS } from '../../../shared/liveArchiveFeeds';
import { MBTA_VEHICLES_CREDIT } from '../../content/noticeCopy';

const lic = (name: string, credit?: string) => ({ url: `https://example.org/${name}`, attribution: 'required' as const, checkedOn: '2026-11-21', name, ...(credit ? { credit } : {}) });
const agencies = [
  { slug: 'sto', name: 'STO (Gatineau)', dataLicense: lic('STO terms', 'Le présent service intègre les données.') },
  { slug: 'stlevis', name: 'STLévis', dataLicense: lic('CC BY 4.0') },
  { slug: 'mbta', name: 'Massachusetts Bay Transportation Authority', cities: ['Boston, MA'] },
];

describe('Schedule sources credits (CIV-461)', () => {
  it("shows each agency's name as a pill; opening it shows the licence, linked, and any words it requires", () => {
    render(<SourceCredits agencies={agencies} massDot={false} focusSlug={null} focusN={0} />);
    const sto = screen.getByRole('button', { name: /^STO/ });
    expect(sto).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Le présent service intègre les données.')).toBeNull();
    fireEvent.click(sto);
    expect(sto).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: /STO terms/ })).toHaveAttribute('href', 'https://example.org/STO terms');
    expect(screen.getByText('Le présent service intègre les données.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^STLévis/ }));
    expect(screen.getByRole('link', { name: /CC BY 4.0/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /MBTA/ })).toBeNull();
  });

  it("puts MassDOT's credit under MBTA's own pill where Live is on, and opens the pill the map asked for", () => {
    expect(MASSDOT_CREDITED_SLUGS.has('mbta')).toBe(true);
    render(<SourceCredits agencies={agencies} massDot focusSlug="mbta" focusN={1} />);
    expect(screen.getByRole('button', { name: /^MBTA/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(MBTA_VEHICLES_CREDIT)).toBeTruthy();
    expect(screen.getAllByRole('button').map(b => b.textContent?.split(' · ')[0])).toEqual(['MBTA', 'STLévis', 'STO']);
  });
});
