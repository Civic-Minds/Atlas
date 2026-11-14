import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RouteDirectionRow from '../RouteDirectionRow';

// CIV-1143 (Ryan 2026-10-30): a long value goes under the whole destination name, at the right, as Compare's rows do (CIV-844).
describe('RouteDirectionRow long values', () => {
  it('keeps a long two-part value in the value column on two right-aligned lines, the name beside it (CIV-1465, the CIV-1300 list rule)', () => {
    const { container } = render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue headway={60} headwayLabel="every 60 min until 5:05 PM" />);
    const name = screen.getByText('to Centrepointe');
    expect(name.className).not.toContain('basis-full');
    expect(name.className).not.toContain('truncate');
    expect([...container.querySelectorAll('span.flex-col.items-end > span')].map(el => el.textContent)).toEqual(['every 60 min', 'until 5:05 PM']);
  });

  it('puts a long value with no two parts under the whole name instead of cutting the name (CIV-1143)', () => {
    render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue limited limitedLabel="Runs irregularly in this period" />);
    const name = screen.getByText('to Centrepointe');
    expect(name.className).toContain('basis-full');
    expect(name.className).not.toContain('truncate');
  });

  it('keeps a plain value or a short range on the first line at the right, the name wrapping beneath itself, never cut (CIV-1165)', () => {
    const { rerender, container } = render(<RouteDirectionRow label="to Pearson Airport via Dixon Rd" singleLine wrapLongValue headway={16} />);
    const name = () => screen.getByText('to Pearson Airport via Dixon Rd');
    expect(name().className).not.toContain('truncate');
    expect(name().className).not.toContain('basis-full');
    expect(name().className).toContain('break-words');
    expect(container.querySelector('div.flex-wrap')).toBeNull();
    rerender(<RouteDirectionRow label="to Pearson Airport via Dixon Rd" singleLine wrapLongValue headway={120} trunkHeadway={60} />);
    expect(name().className).not.toContain('truncate');
  });

  it('leaves rows that do not ask for it as they were', () => {
    render(<RouteDirectionRow label="to Centrepointe" singleLine headway={60} headwayLabel="every 60 min until 5:05 PM" />);
    expect(screen.getByText('to Centrepointe').className).toContain('truncate');
  });
});
