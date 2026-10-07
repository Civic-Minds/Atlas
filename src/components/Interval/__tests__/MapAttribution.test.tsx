import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapAttribution } from '../MapAttribution';

describe('MapAttribution', () => {
  it('uses the shared map-pill label treatment for feedback and attribution', () => {
    render(<MapAttribution />);

    const feedback = screen.getByRole('link', { name: 'Feedback' });
    const about = screen.getByRole('link', { name: 'About Atlas' });
    expect(about).toHaveAttribute('href', '/about');
    const osm = screen.getByRole('link', { name: 'OpenStreetMap' });
    const carto = screen.getByRole('link', { name: 'CARTO' });
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'About Atlas',
      'Feedback',
      'OpenStreetMap',
      'CARTO',
    ]);

    for (const element of [feedback, about, osm, carto]) {
      expect(element.className).toContain('text-[10px]');
      expect(element.className).toContain('font-semibold');
      expect(element.className).toContain('leading-none');
    }

    expect(feedback.getAttribute('href')).toContain(encodeURIComponent('Feedback:\n\n\nPage:'));
  });
});
