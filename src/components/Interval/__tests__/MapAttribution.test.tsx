import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapAttribution } from '../MapAttribution';

describe('MapAttribution', () => {
  it('uses the shared map-pill label treatment for feedback and attribution', () => {
    render(<MapAttribution />);

    const feedback = screen.getByRole('link', { name: 'Feedback' });
    const osm = screen.getByRole('link', { name: 'OpenStreetMap' });
    const carto = screen.getByRole('link', { name: 'CARTO' });

    for (const element of [feedback, osm, carto]) {
      expect(element.className).toContain('text-[10px]');
      expect(element.className).toContain('font-semibold');
      expect(element.className).toContain('leading-none');
    }
  });
});
