import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiteFooter, { footerGroups } from '../SiteFooter';
import { FEATURES } from '../../../shared/config';
import { FOOTER_HEADINGS, PAGE_NAMES } from '../../../shared/pageNames';
import { PLANNERS_PATH } from '../../../shared/pagePaths';

// A mutable copy of the flags, so each test can turn For Planners on (beta) or off (public).
vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES } };
});

const flags = FEATURES as { plannersLink: boolean };
const original = flags.plannersLink;
afterEach(() => { flags.plannersLink = original; });

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

  it('puts For Planners in its own Product column, between Learn and Atlas (CIV-1699)', () => {
    flags.plannersLink = true;
    const groups = footerGroups();
    expect(groups.map(g => g.title)).toEqual([FOOTER_HEADINGS.explore, FOOTER_HEADINGS.learn, FOOTER_HEADINGS.product, FOOTER_HEADINGS.atlas]);
    const product = groups.find(g => g.title === FOOTER_HEADINGS.product)!;
    expect(product.links.map(l => l.label)).toEqual([PAGE_NAMES.plannersLink]);
    const learn = groups.find(g => g.title === FOOTER_HEADINGS.learn)!;
    expect(learn.links.map(l => l.label)).not.toContain(PAGE_NAMES.plannersLink);

    render(<SiteFooter />);
    expect(screen.getByText(FOOTER_HEADINGS.product)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: PAGE_NAMES.plannersLink })).toHaveAttribute('href', PLANNERS_PATH);
  });

  it('shows no empty Product column when For Planners is off (public)', () => {
    flags.plannersLink = false;
    expect(footerGroups().map(g => g.title)).toEqual([FOOTER_HEADINGS.explore, FOOTER_HEADINGS.learn, FOOTER_HEADINGS.atlas]);
    render(<SiteFooter />);
    expect(screen.queryByText(FOOTER_HEADINGS.product)).toBeNull();
    expect(screen.queryByRole('link', { name: PAGE_NAMES.plannersLink })).toBeNull();
  });
});
