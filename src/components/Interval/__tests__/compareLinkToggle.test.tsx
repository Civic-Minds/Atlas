import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COMPARE_LINK_LABEL, CompareLinkToggle } from '../CompareControl';

describe('CompareLinkToggle', () => {
  it('is pressed when linked, not pressed when unlinked, and toggles on click', () => {
    const onChange = vi.fn();
    const { rerender } = render(<CompareLinkToggle linked onChange={onChange} />);
    const button = screen.getByRole('button', { name: COMPARE_LINK_LABEL });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('title')).toBe(COMPARE_LINK_LABEL);
    fireEvent.click(button);
    expect(onChange).toHaveBeenLastCalledWith(false);
    rerender(<CompareLinkToggle linked={false} onChange={onChange} />);
    expect(screen.getByRole('button', { name: COMPARE_LINK_LABEL }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
