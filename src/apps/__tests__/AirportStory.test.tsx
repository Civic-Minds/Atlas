import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AirportStory from '../AirportStory';

const ROUTE = '<Route path="/research/airports/story" element={<AirportStory />} />';

describe('AirportStory (CIV-1550, dev only)', () => {
  it('is registered only inside main.tsx’s import.meta.env.DEV block, so no public or beta build has it', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    const start = main.indexOf('{import.meta.env.DEV && (');
    const end = main.indexOf(')}', start);
    expect(start).toBeGreaterThan(-1);
    const devBlock = main.slice(start, end);
    expect(devBlock).toContain(ROUTE);
    // Only that one route uses it, and its lazy import is behind DEV too: with DEV false, Vite drops the route and the chunk.
    expect(main.split('<AirportStory').length - 1).toBe(1);
    expect(main).toContain("const AirportStory = import.meta.env.DEV ? React.lazy(() => import('./apps/AirportStory')) : () => null;");
    expect(main).not.toMatch(/^import .*AirportStory/m);
    // Not in the site's route lists (sitemap, prerender, research index).
    for (const f of ['shared/config.ts', 'shared/seo.ts']) expect(readFileSync(f, 'utf8')).not.toContain('/research/airports');
  });

  it('shows the draft with its title placeholder, chart placeholders and editor’s notes', () => {
    render(<AirportStory />);
    expect(screen.getByRole('heading', { level: 1, name: "[Ryan's wording: title]" })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The midday hole' })).toBeInTheDocument();
    expect(screen.getByText(/\[Chart later: week grid per airport/)).toBeInTheDocument();
    expect(screen.getAllByText('Editor’s note:')).toHaveLength(2);
    expect(screen.queryByText(/Before publishing/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Method' })).toBeInTheDocument();
  });
});
