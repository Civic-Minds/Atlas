import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapAttribution } from '../MapAttribution';

describe('MapAttribution', () => {
  it('uses the shared map-pill label treatment for feedback and attribution', () => {
    render(<MapAttribution />);

    const feedback = screen.getByRole('link', { name: 'Feedback' });
    const about = screen.getByRole('link', { name: 'About Atlas' });
    expect(about).toHaveAttribute('href', '/about');
    const osm = screen.getByRole('link', { name: '© OpenStreetMap contributors' });
    const carto = screen.getByRole('link', { name: '© CARTO' });
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'About Atlas',
      'Feedback',
      '© OpenStreetMap contributors',
      '© CARTO',
    ]);

    for (const element of [feedback, about, osm, carto]) {
      expect(element.className).toContain('text-xs');
      expect(element.className).toContain('font-semibold');
      expect(element.className).toContain('leading-none');
    }

    expect(feedback.getAttribute('href')).toContain(encodeURIComponent('Feedback:\n\n\nPage:'));
  });

  it('folds About, What\'s new and Feedback into one About card on phones', () => {
    render(<MapAttribution whatsNewEnabled />);
    const about = screen.getByRole('button', { name: 'About' });
    expect(screen.getAllByRole('link', { name: 'About Atlas' })).toHaveLength(1);
    fireEvent.click(about);
    expect(screen.getAllByRole('link', { name: 'About Atlas' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(2);
    expect(screen.getByText("What's new")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(1);
    fireEvent.click(about);
    fireEvent.pointerDown(document.body);
    expect(screen.getAllByRole('link', { name: 'Feedback' })).toHaveLength(1);
  });
});
