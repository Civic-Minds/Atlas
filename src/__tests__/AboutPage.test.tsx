import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '../../shared/config';
import AboutPage from '../AboutPage';
import { newestResearch, RESEARCH } from '../data/research';

describe('About page (CIV-1206 D)', () => {
  it('shows the headline beside the map picture, in a light and a dark version', () => {
    const { container } = render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Find the transit service that actually runs.' })).toBeInTheDocument();
    const map = [...container.querySelectorAll('img')].filter(img => img.getAttribute('src')?.startsWith('/assets/about/'));
    expect(map.map(img => [img.getAttribute('src'), img.className.split(' ')[0]])).toEqual([
      ['/assets/about/atlas-routes-toronto-light.webp', 'theme-light-only'],
      ['/assets/about/atlas-routes-toronto-dark.webp', 'theme-dark-only'],
    ]);
    // Decorative: the headline beside it says what Atlas is.
    for (const img of map) expect(img).toHaveAttribute('alt', '');
  });

  it.runIf(FEATURES.researchApps)('lists the newest research as story tiles in a region named by its heading', () => {
    render(<AboutPage />);
    const row = screen.getByRole('region', { name: 'Explore our research' });
    const links = within(row).getAllByRole('link');
    expect(links.map(a => a.getAttribute('href'))).toEqual(newestResearch(3).map(e => e.href));
    for (const entry of newestResearch(3)) {
      const tile = links.find(a => a.getAttribute('href') === entry.href)!;
      expect(within(tile).getByText(entry.linkText)).toBeInTheDocument();
      expect([...tile.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual([`${entry.picture}-light.svg`, `${entry.picture}-dark.svg`]);
    }
  });

  it('keeps Where, When and How often', () => {
    render(<AboutPage />);
    for (const name of ['Where', 'When', 'How often']) expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
  });
});

describe('research share pictures (CIV-1206)', () => {
  it('gives every research page a picture', () => {
    for (const e of RESEARCH) expect(e.picture).toMatch(/^\/assets\/research\/share\/[a-z-]+$/);
  });
});
