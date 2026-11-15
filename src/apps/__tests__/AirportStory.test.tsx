import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AirportStory from '../AirportStory';

describe('AirportStory (CIV-1550, dev only)', () => {
  it('is registered only through the dev-only draft list, so no public or beta build has it', () => {
    const drafts = readFileSync('src/apps/researchDrafts.ts', 'utf8');
    // The list is empty unless import.meta.env.DEV: with DEV false, Vite drops the route, the /research card and the chunk.
    expect(drafts).toMatch(/RESEARCH_DRAFTS: readonly ResearchDraft\[\] = import\.meta\.env\.DEV\s*\?/);
    expect(drafts).toContain("href: '/research/airports/story'");
    expect(drafts).toContain("React.lazy(() => import('./AirportStory'))");
    const main = readFileSync('src/main.tsx', 'utf8');
    const start = main.indexOf('{import.meta.env.DEV && (');
    expect(start).toBeGreaterThan(-1);
    expect(main.indexOf('RESEARCH_DRAFTS.map(')).toBeGreaterThan(start);
    // Nothing imports the page directly.
    expect(main).not.toContain('AirportStory');
    // Not in the site's route lists (sitemap, prerender) or the published research list.
    for (const f of ['shared/config.ts', 'shared/seo.ts', 'src/data/research.ts']) expect(readFileSync(f, 'utf8')).not.toContain('/research/airports');
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
