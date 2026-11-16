import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PageShell from '../PageShell';

// #1509 (Ryan, 2026-11-14: "like we already have the go to atlas button so confusing"): on every page with the shared
// header, the logo opens the About home page and "Go to Atlas" opens the map, so the two never lead to the same place.
describe('shared page header and footer logos (#1509)', () => {
  it('both logos open /about and Go to Atlas opens the map', () => {
    render(<PageShell><p>Body</p></PageShell>);
    const logos = screen.getAllByRole('link', { name: 'Atlas by Civic Minds' });
    expect(logos.length).toBe(2);
    for (const logo of logos) expect(logo).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: /Go to Atlas/ })).toHaveAttribute('href', '/');
  });
});
