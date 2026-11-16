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
      'Get in Touch',
    ]) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  });

  it('shows the map pictures from its own folder, each in a light and a dark version except the export', () => {
    const { container } = render(<PlannersPage />);
    const srcs = [...container.querySelectorAll('img')].map(img => img.getAttribute('src'));
    for (const name of ['hero', 'tiers-all', 'tiers-10', 'compare', 'chicago', 'routecard', 'bayarea']) {
      expect(srcs).toContain(`/assets/planners/${name}-light.webp`);
      expect(srcs).toContain(`/assets/planners/${name}-dark.webp`);
    }
    expect(srcs).toContain('/assets/planners/export.webp');
    for (const img of container.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '');
  });

  it('opens the map from the top and the bottom, and gives the contact email', () => {
    render(<PlannersPage />);
    const open = screen.getAllByRole('link', { name: 'Open the map' });
    expect(open.map(a => a.getAttribute('href'))).toEqual(['/', '/']);
    for (const a of screen.getAllByRole('link', { name: 'hey@ryanisnota.pro' })) expect(a).toHaveAttribute('href', 'mailto:hey@ryanisnota.pro');
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
