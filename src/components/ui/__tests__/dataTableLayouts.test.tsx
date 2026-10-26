import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DataTable, { type DataTableLayout } from '../DataTable';

const rows = [{ id: 'a', v: 1 }];
const columns = [{ key: 'id', header: 'Name', cell: (r: { id: string }) => r.id }, { key: 'v', header: 'Value', cell: (r: { v: number }) => r.v }];
const table = (layout?: DataTableLayout, narrowFit = false) =>
  render(<DataTable layout={layout} narrowFit={narrowFit} rows={rows} rowKey={r => r.id} columns={columns} />).container.querySelector('table') as HTMLTableElement;

describe('DataTable layouts (CIV-984)', () => {
  it('content: sizes columns to their content, no set widths', () => {
    const t = table();
    expect(t.className).not.toContain('table-fixed');
    expect(t.querySelector('colgroup')).toBeNull();
    expect(t.getAttribute('style')).toBeNull();
  });
  it('fixed: every column at its set width, the table only as wide as they are', () => {
    const t = table('fixed');
    expect(t.className).toContain('table-fixed');
    expect(t.style.width).toBe('24rem');
    expect([...t.querySelectorAll('col')].map(c => (c as HTMLElement).style.width)).toEqual(['16rem', '8rem']);
  });
  it('fill: spans the container, never narrower than the set widths; narrowFit fits a phone', () => {
    const t = table('fill');
    expect(t.style.width).toBe('100%');
    expect(t.style.minWidth).toBe('24rem');
    expect(table('fill', true).className).toContain('sm:table-fixed');
  });
  it('page: spans the container with the other columns right-aligned at the edge, plain fixed widths on phones', () => {
    const t = table('page');
    expect(t.style.width).toBe('100%');
    expect(t.style.getPropertyValue('--table-w')).toBe('24rem');
    expect(t.querySelector('th:last-child')!.className).toContain('sm:text-right');
  });
});
