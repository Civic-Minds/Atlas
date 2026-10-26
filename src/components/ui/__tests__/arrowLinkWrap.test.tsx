import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ArrowLink from '../ArrowLink';

describe('ArrowLink wrap', () => {
  it('draws a wrapping link inline, arrow after the text', () => {
    render(<ArrowLink size="xs" tone="inline" wrap href="/area/toronto">All Greater Toronto and Hamilton Area agencies</ArrowLink>);
    const link = screen.getByRole('link');
    expect(link.className).not.toContain('inline-flex');
    expect(link.className).toContain('text-xs');
    expect(link.querySelector('svg')?.getAttribute('class')).toContain('ml-1');
    // The arrow stays with the last word.
    expect(link.querySelector('span.whitespace-nowrap')?.textContent).toBe('agencies');
    expect(link.querySelector('span.whitespace-nowrap svg')).not.toBeNull();
  });
  it('keeps the flex layout without wrap', () => {
    render(<ArrowLink size="xs" tone="inline" href="/x">About this agency</ArrowLink>);
    expect(screen.getByRole('link').className).toContain('inline-flex');
  });
});
