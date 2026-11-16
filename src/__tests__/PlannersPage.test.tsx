import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../shared/config';
import PlannersPage from '../PlannersPage';

describe('For Transit Planners page (CIV-1320)', () => {
  it('has the approved title and section headings', () => {
    render(<PlannersPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'For Transit Planners' })).toBeInTheDocument();
    for (const name of [
      'See Frequency, Not Just Routes',
      'See How Service Changes Over the Day and Week',
      'Every Agency in a Region, on One Map',
      'A Map Instead of a Long Report',
      'Live Vehicles',
      'Where the Data Comes From',
      "What Atlas Doesn’t Do",
    ]) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  });

  it('shows the map pictures from its own folder: the hero, then one 4:3 picture per feature card, light and dark, desktop and phone (CIV-1701)', () => {
    const { container } = render(<PlannersPage />);
    const srcs = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'));
    const phone = [...container.querySelectorAll('source')].map(s => s.getAttribute('srcset'));
    for (const theme of ['light', 'dark']) {
      expect(srcs).toContain(`/assets/planners/hero-${theme}.webp`);
      for (const card of ['frequency', 'dayweek', 'agency', 'export']) {
        expect(srcs).toContain(`/assets/planners/card-${card}-desktop-${theme}.webp`);
        expect(phone).toContain(`/assets/planners/card-${card}-phone-${theme}.webp`);
      }
    }
    for (const img of container.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '');
    for (const img of container.querySelectorAll('picture img')) expect(img.className).toContain('aspect-[4/3]');
  });

  it('opens the map from the top, gives the contact email, and ends with one Request a demo button (CIV-1706)', () => {
    render(<PlannersPage />);
    const open = screen.getAllByRole('link', { name: 'Try Atlas' });
    expect(open.map(a => a.getAttribute('href'))).toEqual(['/']);
    for (const a of screen.getAllByRole('link', { name: 'hey@ryanisnota.pro' })) expect(a).toHaveAttribute('href', 'mailto:hey@ryanisnota.pro');
    expect(screen.queryByRole('heading', { name: 'Get in Touch' })).not.toBeInTheDocument();
    const demo = screen.getAllByRole('link', { name: 'Request a demo' });
    expect(demo).toHaveLength(1);
    expect(demo[0]).toHaveAttribute('href', 'mailto:hey@ryanisnota.pro?subject=Request%20a%20demo');
  });

  it('links its Live card to Live only when the Live flag is on (CIV-1705)', () => {
    render(<PlannersPage />);
    const open = screen.queryByRole('link', { name: 'Open Live' });
    if (FEATURES.live) expect(open).toHaveAttribute('href', '/apps/live');
    else expect(open).toBeNull();
  });
});

describe('For Transit Planners flag (CIV-1704: local only)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  it('is on only on the Vite dev server, never on a beta or public build', async () => {
    const flagFor = async (dev: boolean, mode: string) => {
      vi.resetModules();
      vi.stubEnv('DEV', dev);
      vi.stubEnv('VITE_ATLAS_MODE', mode);
      const config = await import('../../shared/config');
      return [config.FEATURES.plannersLink, config.seoFlags().planners];
    };
    expect(await flagFor(true, 'dev')).toEqual([true, true]);
    expect(await flagFor(false, 'beta')).toEqual([false, false]);
    expect(await flagFor(false, 'preview')).toEqual([false, false]);
    expect(await flagFor(false, 'public')).toEqual([false, false]);
  });
});
