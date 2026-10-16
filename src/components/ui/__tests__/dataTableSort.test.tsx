import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DataTable from '../DataTable';

const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];

describe('DataTable sortable headers', () => {
  it('makes only opted-in headers buttons, marks the sorted one with aria-sort, and reports clicks', () => {
    const onSort = vi.fn();
    render(<DataTable rows={rows} rowKey={r => r.id} sort={{ key: 'v', reversed: false }} onSort={onSort}
      columns={[{ key: 'id', header: 'Name', cell: r => r.id }, { key: 'v', header: 'Value', sortable: true, cell: r => r.v }]} />);
    expect(screen.queryByRole('button', { name: /Name/ })).toBeNull();
    const th = screen.getByRole('columnheader', { name: /Value/ });
    expect(th.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /Value/ }));
    expect(onSort).toHaveBeenCalledWith('v');
  });

  it('shows ascending when the order is reversed', () => {
    render(<DataTable rows={rows} rowKey={r => r.id} sort={{ key: 'v', reversed: true }} onSort={() => {}}
      columns={[{ key: 'v', header: 'Value', sortable: true, cell: r => r.v }]} />);
    expect(screen.getByRole('columnheader', { name: /Value/ }).getAttribute('aria-sort')).toBe('ascending');
  });
});
