import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ToolsMenu from '../ToolsMenu';

describe('ToolsMenu', () => {
  it('keeps the menu mounted for modified clicks so the browser can open a new tab', () => {
    render(<ToolsMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));

    const link = screen.getByRole('link', { name: /Diagnostics table/ });
    expect(link).toHaveAttribute('href', '/apps/diagnostics/table');
    fireEvent.click(link, { metaKey: true });

    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the menu for an ordinary click', () => {
    render(<ToolsMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
    fireEvent.click(screen.getByRole('link', { name: /Diagnostics table/ }));

    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-expanded', 'false');
  });
});
