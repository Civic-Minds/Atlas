import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogPage from '../ChangelogPage';

describe('ChangelogPage', () => {
  it('lists versions with their full release date and no map data lines', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { name: /Version 3\.4\s*·\s*Nov 9, 2026/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Version 3\.3\s*·\s*Oct 12, 2026/ })).toBeInTheDocument();
    expect(screen.getByText('What changed in Atlas.')).toBeInTheDocument();
    expect(screen.queryByText(/Map data updated/i)).toBeNull();
  });

  it('shows bullet leads in normal weight so only the headers are bold', () => {
    const { container } = render(<ChangelogPage />);
    const leads = container.querySelectorAll('li strong');
    expect(leads.length).toBeGreaterThan(0);
    leads.forEach(el => {
      expect(el).toHaveClass('font-normal');
      expect(el).not.toHaveClass('font-black');
    });
  });
});
