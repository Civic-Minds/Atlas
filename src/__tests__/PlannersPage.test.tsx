import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES } from '../../shared/config';
import PlannersPage from '../PlannersPage';
import coverage from '../../shared/data/atlas-coverage.json';

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
      'Request a Demo',
    ]) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  });

  it('says exactly how many agencies Atlas covers, from the published data, and links to the Docs on it (CIV-1724)', () => {
    render(<PlannersPage />);
    expect(screen.getByText(new RegExp(`^Atlas covers ${coverage.public.agencies} transit agencies in Canada and the US\\.`))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read how Atlas works' })).toHaveAttribute('href', '/about/docs#data-flow');
  });

  it('alternates the picture side of the feature cards on desktop, right then left (CIV-1754)', () => {
    const { container } = render(<PlannersPage />);
    const sides = [...container.querySelectorAll('[data-picture-side]')].map(c => c.getAttribute('data-picture-side'));
    expect(sides.slice(0, 4)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('shows the map pictures from its own folder: the hero, then one 4:3 picture per feature card, light and dark, desktop and phone (CIV-1701)', () => {
    const { container } = render(<PlannersPage />);
    const srcs = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'));
    const phone = [...container.querySelectorAll('source')].map(s => s.getAttribute('srcset'));
    for (const theme of ['light', 'dark']) {
      expect(srcs).toContain(`/assets/planners/hero-${theme}.webp`);
      for (const card of ['frequency', 'dayweek', 'agency', 'export', 'demo']) {
        expect(srcs).toContain(`/assets/planners/card-${card}-desktop-${theme}.webp`);
        expect(phone).toContain(`/assets/planners/card-${card}-phone-${theme}.webp`);
      }
    }
    for (const img of container.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '');
    for (const img of container.querySelectorAll('picture img')) expect(img.className).toContain('aspect-[4/3]');
  });

  it('opens the map from the top and ends with one Request a demo button, its only email link (CIV-1706, CIV-1751)', () => {
    render(<PlannersPage />);
    const open = screen.getAllByRole('link', { name: 'Try Atlas' });
    expect(open.map(a => a.getAttribute('href'))).toEqual(['/']);
    expect(screen.queryByRole('link', { name: 'hey@ryanisnota.pro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What Atlas Doesn’t Do' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Get in Touch' })).not.toBeInTheDocument();
    const demo = screen.getAllByRole('link', { name: 'Request a demo' });
    expect(demo).toHaveLength(1);
    expect(demo[0]).toHaveAttribute('href', 'mailto:hey@ryanisnota.pro?subject=Request%20a%20demo');
    // Ryan, 2026-11-16: the button sits in the shared Request a demo feature card, the last card on the page.
    expect(demo[0].closest('section')).toContainElement(screen.getByRole('heading', { level: 2, name: 'Request a Demo' }));
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
