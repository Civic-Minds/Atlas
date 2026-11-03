import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewEntry } from '../CompareControl';
import { PREVIEW_ENTRY_ARIA_LABEL } from '../../../content/noticeCopy';

describe('PreviewEntry (CIV-1252)', () => {
  it('opens Preview when off and leaves it when on, then closes the menu', () => {
    const onStart = vi.fn();
    const onExit = vi.fn();
    const onDone = vi.fn();
    const { rerender } = render(<PreviewEntry variant="menu" active={false} onStart={onStart} onExit={onExit} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: PREVIEW_ENTRY_ARIA_LABEL }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    rerender(<PreviewEntry variant="menu" active onStart={onStart} onExit={onExit} onDone={onDone} />);
    const button = screen.getByRole('button', { name: PREVIEW_ENTRY_ARIA_LABEL });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
