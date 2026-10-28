import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PanelHeader from '../PanelHeader';

describe('PanelHeader', () => {
  it('names the panel by its title and wires back and close', () => {
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(<PanelHeader titleId="t" title="Hidden routes" onBack={onBack} backLabel="Back to settings" onClose={onClose} closeLabel="Close settings" />);
    expect(screen.getByRole('heading', { name: 'Hidden routes' }).id).toBe('t');
    fireEvent.click(screen.getByRole('button', { name: 'Back to settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no back arrow without onBack', () => {
    render(<PanelHeader title="What's new" onClose={() => {}} closeLabel="Close what's new" />);
    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(["Close what's new"]);
  });
});
