import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompareMenuItem, CompareTab } from '../CompareControl';
import { ModeTabsProvider } from '../../ModeTabLabel';

// CIV-1361: Compare is in beta, so its top-bar tab carries a small "Beta" tag in every mode.
describe('Compare tab Beta tag', () => {
  it.each([true, false])('shows exactly "Beta" after the label and names itself "Compare two maps, beta" (selected %s)', active => {
    render(<CompareTab active={active} onStart={() => {}} onExit={() => {}} />);
    const tab = screen.getByRole('button', { name: 'Compare two maps, beta' });
    expect(tab.textContent).toBe('CompareBeta');
    expect(tab.getAttribute('aria-pressed')).toBe(String(active));
    expect(screen.getByText('Beta').className).not.toMatch(/uppercase/);
  });

  it('folds the tag away with the label when the tab shrinks to its icon', () => {
    render(<ModeTabsProvider nonMapViewActive><CompareTab active={false} onStart={() => {}} onExit={() => {}} /></ModeTabsProvider>);
    const tag = screen.getByText('Beta', { selector: 'span' });
    expect(tag.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Compare two maps, beta' }).getAttribute('title')).toBe('Compare');
  });

  it('leaves the phone menu item untagged', () => {
    render(<CompareMenuItem active={false} onStart={() => {}} onExit={() => {}} onDone={() => {}} />);
    expect(screen.getByRole('button', { name: 'Compare two maps' }).textContent).toBe('Compare');
  });
});
