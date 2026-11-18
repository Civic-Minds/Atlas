import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SiteFooter, { footerGroups } from '../SiteFooter';
import { FEATURES } from '../../../shared/config';
import { FOOTER_HEADINGS, PAGE_NAMES } from '../../../shared/pageNames';

// A mutable copy of the flags, so each test can turn For Planners on (beta) or off (public).
vi.mock('../../../shared/config', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES } };
});

const flags = FEATURES as { plannersLink: boolean; researchersLink: boolean };
const original = { planners: flags.plannersLink, researchers: flags.researchersLink };
afterEach(() => { flags.plannersLink = original.planners; flags.researchersLink = original.researchers; });

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

  it('leaves For Planners and For Researchers out even where they exist: they are reached from /internal (CIV-1872)', () => {
    flags.plannersLink = true;
    flags.researchersLink = true;
    expect(footerGroups().map(g => g.title)).toEqual([FOOTER_HEADINGS.explore, FOOTER_HEADINGS.learn, FOOTER_HEADINGS.atlas]);
    render(<SiteFooter />);
    expect(screen.queryByRole('link', { name: PAGE_NAMES.plannersLink })).toBeNull();
    expect(screen.queryByRole('link', { name: PAGE_NAMES.researchers })).toBeNull();
  });

  it('shows no empty Product column when For Planners and For Researchers are off (public)', () => {
    flags.plannersLink = false;
    flags.researchersLink = false;
    expect(footerGroups().map(g => g.title)).toEqual([FOOTER_HEADINGS.explore, FOOTER_HEADINGS.learn, FOOTER_HEADINGS.atlas]);
    render(<SiteFooter />);
    expect(screen.queryByText(FOOTER_HEADINGS.product)).toBeNull();
    expect(screen.queryByRole('link', { name: PAGE_NAMES.plannersLink })).toBeNull();
    expect(screen.queryByRole('link', { name: PAGE_NAMES.researchers })).toBeNull();
  });
});
