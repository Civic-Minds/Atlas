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

  // CIV-1404: the Live tables use the area page's `page` layout with two options. Both are off unless asked for, so the
  // area and agency pages' tables keep exactly these classes.
  it('page, as the area page uses it: the same table, column and cell classes as before the options existed', () => {
    const three = [...columns, { key: 'w', header: 'Other', cell: () => 2 }];
    const t = render(<DataTable layout="page" rowHref={() => '/agency/a'} rows={rows} rowKey={r => r.id} columns={three} />).container.querySelector('table') as HTMLTableElement;
    expect(t.className).toBe('w-full text-left text-xs table-fixed max-sm:!w-[var(--table-w)] sm:min-w-[var(--table-min)]');
    expect(t.style.getPropertyValue('--table-min')).toBe('32rem');
    expect([...t.querySelectorAll('col')].map(c => c.className)).toEqual(['w-[var(--col-phone)] sm:w-auto', 'w-[var(--col-phone)] sm:w-[var(--col-w)]', 'w-[var(--col-phone)] sm:w-[var(--col-w)]']);
    expect([...t.querySelectorAll('thead th')].map(c => c.className)).toEqual([
      'py-1 font-bold pr-6 pl-2 align-bottom',
      'py-1 font-bold pr-4 sm:pr-0 sm:pl-2 sm:text-right align-bottom',
      'py-1 font-bold sm:pl-2 sm:text-right pr-2 align-bottom',
    ]);
    expect([...t.querySelectorAll('tbody td')].map(c => c.className)).toEqual([
      'py-1 pr-6 pl-2 break-words',
      'py-1 pr-4 sm:pr-0 sm:pl-2 sm:text-right',
      'py-1 sm:pl-2 sm:text-right pr-2',
    ]);
    expect(t.innerHTML).not.toContain('max-sm:hidden');
  });
  it('page with narrowFit (Live): fits a phone with no set width, hides marked columns there, and is the page layout from sm up', () => {
    const cols = [
      { key: 'id', header: 'Stop', cell: (r: { id: string }) => r.id },
      { key: 'dir', header: 'Direction', align: 'left' as const, narrowHide: true, cell: () => 'East' },
      { key: 'v', header: 'Late', cell: (r: { v: number }) => r.v },
      { key: 'n', header: 'Departures', narrowHide: true, cell: () => 9 },
    ];
    const t = render(<DataTable layout="page" narrowFit rows={rows} rowKey={r => r.id} columns={cols} />).container.querySelector('table') as HTMLTableElement;
    // No phone width and no fixed layout below sm, so nothing scrolls sideways there (#1151).
    expect(t.className).toBe('w-full text-left text-xs sm:table-fixed sm:min-w-[var(--table-min)]');
    expect(t.style.getPropertyValue('--table-w')).toBe('');
    expect([...t.querySelectorAll('col')].map(c => c.className)).toEqual(['sm:w-auto', 'sm:w-[var(--col-w)] max-sm:hidden', 'sm:w-[var(--col-w)]', 'sm:w-[var(--col-w)] max-sm:hidden']);
    const cells = [...t.querySelectorAll('tbody td')].map(c => c.className);
    // Words stay left-aligned with their gap on the right; figures are right-aligned from sm up; phone gaps are phone-only.
    expect(cells[1]).toBe('py-1 max-sm:pr-3 sm:pr-4 max-sm:hidden');
    expect(cells[2]).toBe('py-1 sm:pl-2 sm:text-right');
    expect(cells[3]).toBe('py-1 max-sm:pr-3 sm:pl-2 sm:text-right max-sm:hidden');
    expect(t.querySelector('thead th')!.className).toContain('align-bottom');
  });
  it('page: a sorted figure column keeps its arrow before the words, and an unsorted one has none', () => {
    const cols = [{ key: 'id', header: 'Name', cell: (r: { id: string }) => r.id }, { key: 'v', header: 'Late', sortable: true, cell: (r: { v: number }) => r.v }, { key: 'w', header: 'Typical', sortable: true, cell: () => 1 }];
    const t = render(<DataTable layout="page" sort={{ key: 'v', reversed: false }} onSort={() => {}} rows={rows} rowKey={r => r.id} columns={cols} />).container;
    const [late, typical] = [...t.querySelectorAll('thead button')];
    expect(late.textContent).toBe('▼Late');
    expect(typical.textContent).toBe('Typical');
    expect(late.closest('th')!.getAttribute('aria-sort')).toBe('descending');
  });
});
