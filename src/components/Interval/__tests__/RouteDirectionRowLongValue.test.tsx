import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RouteDirectionRow from '../RouteDirectionRow';

// CIV-1143 (Ryan 2026-10-30): a long value goes under the whole destination name, at the right, as Compare's rows do (CIV-844).
describe('RouteDirectionRow long values', () => {
  it('puts a long value under the whole name instead of cutting the name', () => {
    render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue headway={60} headwayLabel="until 5:05 PM, every 60 min" />);
    const name = screen.getByText('to Centrepointe');
    expect(name.className).toContain('basis-full');
    expect(name.className).not.toContain('truncate');
  });

  it('keeps a plain value or a short range beside the name on one line', () => {
    const { rerender } = render(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue headway={60} />);
    expect(screen.getByText('to Centrepointe').className).toContain('truncate');
    rerender(<RouteDirectionRow label="to Centrepointe" singleLine wrapLongValue headway={120} trunkHeadway={60} />);
    expect(screen.getByText('to Centrepointe').className).toContain('truncate');
  });

  it('leaves rows that do not ask for it as they were', () => {
    render(<RouteDirectionRow label="to Centrepointe" singleLine headway={60} headwayLabel="until 5:05 PM, every 60 min" />);
    expect(screen.getByText('to Centrepointe').className).toContain('truncate');
  });
});
