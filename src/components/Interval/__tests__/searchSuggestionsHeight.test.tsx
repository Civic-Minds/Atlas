import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SearchSuggestionsPanel } from '../SearchSuggestionsPanel';

const route = (i: number) => ({ key: `ttc::${i}`, shortName: String(i), label: { primary: String(i), secondary: `Route ${i}`, text: `${i} — Route ${i}` }, longName: `Route ${i}`, agencyName: 'TTC', headway: 5, limited: false });

describe('search suggestions height', () => {
  it('shrinks to the sidebar cap and scrolls inside itself instead of overflowing the screen', () => {
    render(
      <SearchSuggestionsPanel
        recentSearches={['a', 'b', 'c', 'd', 'e']}
        clearRecentSearches={() => {}}
        setQuery={() => {}}
        recentlyViewed={[1, 2, 3, 4, 5].map(i => ({ key: `ttc::r${i}`, shortName: `R${i}`, longName: '', agencyName: 'TTC' }))}
        suggestedRoutes={[1, 2, 3, 4, 5].map(route) as never}
        pickRoute={() => {}}
        displayForRouteKey={() => ({ headway: 5, limited: false })}
      />,
    );
    const panel = screen.getByTestId('search-suggestions-panel');
    expect(panel.className).toContain('min-h-0');
    expect(panel.className).not.toContain('shrink-0');
    expect(screen.getByTestId('search-suggestions-scroll').className).toContain('overflow-y-auto');
  });
});
