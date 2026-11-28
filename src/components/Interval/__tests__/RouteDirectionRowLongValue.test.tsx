import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RouteDirectionRow from '../RouteDirectionRow';

// CIV-1143 (Ryan 2026-10-30): a long value goes under the whole destination name, at the right, as Compare's rows do (CIV-844).
describe('RouteDirectionRow long values', () => {
  it('keeps a short reading beside the destination on one line, right-aligned (CIV-3040)', () => {
    const { container } = render(<RouteDirectionRow label="to Pearson Airport" singleLine wrapLongValue headway={16} />);
    const name = screen.getByText('to Pearson Airport');
    expect(name.className).not.toContain('truncate');
    expect(name.className).not.toContain('basis-full');
    expect(name.className).toContain('flex-auto');
    // The row wraps only when the reading cannot fit; the reading sits at the right edge either way.
    expect(container.querySelector('div.flex-wrap')).not.toBeNull();
    expect(container.querySelector('span.ml-auto')).not.toBeNull();
  });

  it('lets a reading that does not fit beside the destination drop to line 2, right-aligned, never cutting the name (CIV-3040)', () => {
    const { container } = render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue headway={60} headwayLabel="every 60 min until 5:05 PM" />);
    const name = screen.getByText('to Centrepointe');
    expect(name.className).not.toContain('truncate');
    expect(name.className).not.toContain('basis-full');
    const row = container.querySelector('div.flex-wrap');
    expect(row?.className).toContain('justify-between');
    const value = container.querySelector('span.ml-auto');
    expect(value?.className).toContain('justify-end');
    expect(value?.textContent).toContain('every 60 min');
    expect(value?.textContent).toContain('until 5:05 PM');
  });

  it('does the same for a limited-service reading (CIV-3040)', () => {
    const { container } = render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue limited limitedLabel="Runs irregularly in this period" />);
    expect(screen.getByText('to Centrepointe').className).not.toContain('truncate');
    expect(container.querySelector('div.flex-wrap')).not.toBeNull();
    expect(container.querySelector('span.ml-auto')).not.toBeNull();
  });

  it('leaves rows that do not ask for it as they were', () => {
    render(<RouteDirectionRow label="to Centrepointe" singleLine headway={60} headwayLabel="every 60 min until 5:05 PM" />);
    expect(screen.getByText('to Centrepointe').className).toContain('truncate');
  });
});
