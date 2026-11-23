import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DataTable from '../DataTable';

const rows = [{ id: 'ttc', name: 'TTC', bus: 210 }];
const columns = [
  { key: 'name', header: 'Agency', rowHeader: true, cell: (r: typeof rows[number]) => <a href={`/agency/${r.id}`}>{r.name}</a> },
  { key: 'bus', header: 'Bus', cell: (r: typeof rows[number]) => r.bus },
];

describe('DataTable end-aligned columns and row links (CIV-958)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('right-aligns the other columns and leaves the first column free to take the rest', () => {
    const { container } = render(<DataTable layout="page" rows={rows} rowKey={r => r.id} columns={columns} />);
    expect(screen.getByRole('columnheader', { name: 'Bus' }).className).toContain('text-right');
    expect(screen.getByRole('cell', { name: '210' }).className).toContain('text-right');
    // From sm up the first column takes the rest and the others keep their width; on phones both keep the default widths (CIV-973).
    const cols = container.querySelectorAll('col');
    expect(cols[0].className).toContain('sm:w-auto');
    expect((cols[0] as HTMLElement).style.getPropertyValue('--col-phone')).toBe('16rem');
    expect((cols[1] as HTMLElement).style.getPropertyValue('--col-w')).toBe('8rem');
    expect((container.querySelector('table') as HTMLElement).style.width).toBe('100%');
  });

  it('opens the row link from a click anywhere on the row, and leaves a click on the link itself alone', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<DataTable layout="page" rows={rows} rowKey={r => r.id} columns={columns} rowHref={r => `/agency/${r.id}`} />);
    const row = screen.getByRole('row', { name: /TTC/ });
    expect(row.className).toContain('hover:bg-[var(--bg-btn-hover)]');
    fireEvent.click(screen.getByRole('cell', { name: '210' }));
    expect(assign).toHaveBeenCalledWith('/agency/ttc');
    assign.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'TTC' }));
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('DataTable row detail (MCP page testers, Ryan 2026-11-22)', () => {
  it('draws a row’s detail straight under that row, across every column, and nothing for the others', () => {
    const two = [{ id: 'a', name: 'A', bus: 1 }, { id: 'b', name: 'B', bus: 2 }];
    const { container } = render(<DataTable rows={two} rowKey={r => r.id} columns={columns} rowDetail={r => (r.id === 'a' ? <p>detail of A</p> : null)} />);
    const trs = [...container.querySelectorAll('tbody > tr')];
    expect(trs).toHaveLength(3);
    expect(trs[1].textContent).toBe('detail of A');
    expect(trs[1].querySelector('td')!.colSpan).toBe(2);
    expect(trs[2].textContent).toContain('B');
  });
});
