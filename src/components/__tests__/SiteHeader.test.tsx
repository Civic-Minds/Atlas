import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SiteHeader from '../SiteHeader';

describe('SiteHeader on phones (CIV-1301)', () => {
  it('hides Docs below the sm breakpoint, so the other links fit on one line; it stays in the footer', () => {
    render(<SiteHeader />);
    const docs = screen.getByRole('link', { name: 'Docs' });
    expect(docs.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'sm:inline']));
    for (const name of [/Agencies/, /Research/, /Go to Atlas/]) {
      const link = screen.queryByRole('link', { name });
      if (link) expect(link.className.split(/\s+/), String(name)).not.toContain('hidden');
    }
    expect(screen.getByRole('link', { name: /Go to Atlas/ })).toHaveAttribute('href', '/');
  });
});
