import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import PageSection, { PageTable } from '../PageSection';
import SortableDataTable from '../SortableDataTable';

describe('PageSection (CIV-1404: one section for the area and Live report pages)', () => {
  it('draws the area page section exactly: its top margin, labelled by its title, nothing added', () => {
    const { container } = render(<PageSection id="agencies-heading" title="Agencies and weekday frequency"><p>body</p></PageSection>);
    const section = container.querySelector('section')!;
    expect(section.className).toBe('mt-14');
    expect(section.getAttribute('aria-labelledby')).toBe('agencies-heading');
    expect(section.innerHTML).toBe('<h2 id="agencies-heading" class="text-xl font-black tracking-tight">Agencies and weekday frequency</h2><p>body</p>');
  });
  it('puts the line that says what the section shows under the title', () => {
    const { container } = render(<PageSection id="x" title="Routes" intro="Every analysed route, worst first."><p>body</p></PageSection>);
    expect(container.querySelector('h2 + p')!.className).toBe('mt-2 max-w-3xl text-sm leading-6 text-[var(--text-muted)]');
  });
  it('wraps a table as the area page does, with room for a linked row highlight only when asked', () => {
    expect(render(<PageTable linkedRows><table /></PageTable>).container.firstElementChild!.className).toBe('relative mt-6 -mx-2');
    expect(render(<PageTable><table /></PageTable>).container.firstElementChild!.className).toBe('relative mt-6');
  });
});

describe('SortableDataTable in the page layout', () => {
  const rows = [{ id: 'a', v: 1 }, { id: 'b', v: 3 }, { id: 'c', v: 2 }];
  const columns = [{ key: 'id', header: 'Stop', cell: (r: { id: string }) => r.id }, { key: 'v', header: '1 in 10 later than', worst: (r: { v: number }) => r.v, cell: (r: { v: number }) => r.v }];
  const order = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map(tr => tr.firstElementChild!.textContent);
  it('uses the page layout by default, lets headers wrap, and still sorts worst first then reversed', () => {
    const { container } = render(<SortableDataTable narrowFit rows={rows} rowKey={r => r.id} columns={columns} defaultSort="v" />);
    expect(container.querySelector('table')!.className).toContain('sm:min-w-[var(--table-min)]');
    expect(container.querySelector('thead')!.innerHTML).not.toContain('whitespace-nowrap');
    expect(order(container)).toEqual(['b', 'c', 'a']);
    fireEvent.click(container.querySelector('thead button')!);
    expect(order(container)).toEqual(['a', 'c', 'b']);
  });
  it('keeps one-line headers in the other layouts', () => {
    const { container } = render(<SortableDataTable layout="fill" rows={rows} rowKey={r => r.id} columns={columns} />);
    expect(container.querySelector('thead')!.innerHTML).toContain('whitespace-nowrap');
  });
});
