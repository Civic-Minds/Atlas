import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlannersPage from '../PlannersPage';

describe('For transit planners page (CIV-1320)', () => {
  it('has the approved title and section headings', () => {
    render(<PlannersPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'For transit planners' })).toBeInTheDocument();
    for (const name of [
      'See frequency, not just routes',
      'See how service changes over the day and week',
      'Every agency in a region, on one map',
      'A map instead of a long report',
      'Where the data comes from',
      "What Atlas doesn't do",
      'Get in touch',
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
});
