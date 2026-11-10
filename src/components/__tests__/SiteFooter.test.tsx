import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SiteFooter from '../SiteFooter';

describe('SiteFooter', () => {
  it('keeps Terms and Privacy in their own bottom row, not in the link columns', () => {
    render(<SiteFooter />);
    const legal = screen.getByRole('navigation', { name: 'Legal links' });
    expect(within(legal).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(within(legal).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');

    const columns = screen.getByRole('navigation', { name: 'Footer links' });
    expect(within(columns).queryByRole('link', { name: 'Terms' })).toBeNull();
    expect(within(columns).queryByRole('link', { name: 'Privacy' })).toBeNull();
  });
});
