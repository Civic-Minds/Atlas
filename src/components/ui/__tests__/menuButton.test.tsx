import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MenuButton from '../MenuButton';

const options = [{ key: 'week', label: 'This week' }, { key: 'yesterday', label: 'Yesterday' }] as const;

describe('MenuButton', () => {
  it('opens a radio menu from the keyboard, moves with arrows and picks with Enter', () => {
    const onChange = vi.fn();
    render(<MenuButton label="Week of Oct 8–14" value="week" options={options} onChange={onChange} />);
    const button = screen.getByRole('button', { name: /Week of Oct 8–14/ });
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map(i => i.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Yesterday' }));
    expect(onChange).toHaveBeenCalledWith('yesterday');
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('closes on Escape without changing', () => {
    const onChange = vi.fn();
    render(<MenuButton label="Week of Oct 8–14" value="week" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Week of/ }));
    fireEvent.keyDown(screen.getAllByRole('menuitemradio')[0], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
