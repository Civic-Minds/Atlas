import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SelectionLoadPanel, { SelectionNoticePanel } from '../SelectionLoadPanel';
import { STOP_NOT_FOUND } from '../../../content/noticeCopy';

describe('not-found and load-error notes close like a card (CIV-1145)', () => {
  it('a not-found note has the cards\' "← Map", not a "Close →" link', () => {
    const onClose = vi.fn();
    render(<SelectionNoticePanel message={STOP_NOT_FOUND} onClose={onClose} />);
    expect(screen.getByText(STOP_NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Map' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a load-error note does too', () => {
    const onClose = vi.fn();
    render(<SelectionLoadPanel kind="route" failed onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /Close/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Map' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
