import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageMapOverlayProvider, usePageMapOverlay } from '../context/PageMapOverlay';
import { ViewLoadingPill } from '../components/ViewLoadingPanel';
import { loadingText } from '../content/noticeCopy';
import { PAGE_NAMES } from '../../shared/pageNames';

// CIV-3216: Studio's cold open hands its loading words to the map's loading pill instead of showing a card.
function PillWords() {
  return <div data-testid="pill">{usePageMapOverlay().pageLoading ?? ''}</div>;
}

describe('ViewLoadingPill', () => {
  it('sets the map pill words while mounted and clears them after', () => {
    const { rerender, container } = render(<PageMapOverlayProvider><ViewLoadingPill what={PAGE_NAMES.studio} /><PillWords /></PageMapOverlayProvider>);
    expect(screen.getByTestId('pill').textContent).toBe(loadingText(PAGE_NAMES.studio));
    expect(container.querySelector('[data-panel]')).toBeNull();
    rerender(<PageMapOverlayProvider><PillWords /></PageMapOverlayProvider>);
    expect(screen.getByTestId('pill').textContent).toBe('');
  });
});
