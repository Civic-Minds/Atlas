import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FreeChildFaresPage from '../FreeChildFaresPage';
import ResearchPage from '../ResearchPage';

describe('Free child fares (CIV-1149)', () => {
  it('shows the approved heading, both groups, the note and the table link', () => {
    render(<FreeChildFaresPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Free child fares' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where kids ride free, age 5 is the most common cutoff.' })).toBeInTheDocument();
    expect(screen.getByText('374 of 553 agencies let children ride free up to a set age. Each bar counts the agencies whose free fare ends at that age.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free up to a set age' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other policies' })).toBeInTheDocument();
    expect(screen.getAllByText('Up to 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not found').length).toBeGreaterThan(0);
    // #1290: the note under the charts moved into How we did this, so this sentence is there once.
    expect(screen.getAllByText(/We couldn't find a current official rule for 34 agencies\./)).toHaveLength(1);
    expect(screen.getByText(/Free fares up to 17 or 18 are usually youth programs\./).closest('[data-research-method]')).not.toBeNull();
    expect(screen.queryByText(/Each agency appears once/)).toBeNull();
    expect(screen.getAllByText('Show as a table')).toHaveLength(2);
  });

  it('opens with the approved blurb and ends with How we did this, Canada and US numbers', () => {
    const { container } = render(<FreeChildFaresPage />);
    expect(screen.getByText('We read the official fare rules of 553 transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How we did this' })).toBeInTheDocument();
    expect([...container.querySelectorAll('[data-research-method] strong')].map(el => el.textContent)).toEqual(['Date conducted:', 'Sample:', 'Sources:', 'What counted:', 'Not found yet:', 'Limitations:']);
    expect(screen.getByText(/553 in all, 465 in the United States and 88 in Canada\./)).toBeInTheDocument();
  });

  it('draws the ages and the other policies as two separate charts, each with its own table (CIV-1176)', () => {
    render(<FreeChildFaresPage />);
    const captions = screen.getAllByRole('table', { hidden: true }).map(t => t.querySelector('caption')?.textContent);
    expect(captions).toContain('Free up to a set age');
    expect(captions).toContain('Other policies');
    const ages = screen.getByRole('img', { name: 'How many agencies let children ride free up to each age, from 1 to 18. Age 5 is the most common, at 129 agencies.' });
    expect(ages).toBeInTheDocument();
    const other = screen.getAllByRole('table', { hidden: true }).find(t => t.querySelector('caption')?.textContent === 'Other policies')!;
    expect(other.textContent).toContain('Not found');
    expect(other.textContent).not.toContain('Up to 5');
  });

  it('gives every age from 1 to 18 a column, ages no agency uses at zero, named in the hover line (#1290)', () => {
    const { container } = render(<FreeChildFaresPage />);
    const chart = screen.getByRole('img', { name: /How many agencies let children ride free up to each age/ });
    const columns = [...chart.querySelectorAll('.flex-1.h-full')];
    expect(columns).toHaveLength(18);
    expect(chart.querySelector('[title]')).toBeNull();
    const readout = chart.querySelector('[data-readout]')!;
    expect(readout.textContent).toBe('');
    fireEvent.pointerEnter(columns[4]);
    expect(readout.textContent).toBe('Up to 5: 129 agencies');
    expect(columns[4]).toHaveAttribute('data-lit');
    expect(chart.querySelector('[data-peak]')).toBeNull();
    fireEvent.pointerEnter(columns[14]);
    expect(readout.textContent).toBe('Up to 15: 0 agencies');
    fireEvent.pointerEnter(columns[0]);
    expect(readout.textContent).toBe('Up to 1: 1 agency');
    fireEvent.pointerEnter(columns[17]);
    expect(readout.textContent).toBe('Up to 18: 47 agencies');
    expect(container.querySelectorAll('[data-lit]')).toHaveLength(1);
  });

  it('other policies rows show the normal arrow, not the text cursor, the stripes for not found, and a hover line (#1290)', () => {
    const { container } = render(<FreeChildFaresPage />);
    const list = screen.getByRole('heading', { name: 'Other policies' }).parentElement!;
    const rows = [...list.querySelectorAll('li')];
    expect(rows.map(row => row.textContent?.replace(/\d+$/, ''))).toEqual(['Fare-free', 'Height limit', 'Student program', 'Program only', 'None', 'Not found']);
    for (const row of rows) expect(row).toHaveClass('cursor-default');
    expect(list.querySelector('li[title]')).toBeNull();
    expect((rows[5].querySelector('div > div') as HTMLElement).style.background).toContain('repeating-linear-gradient');
    const readout = list.querySelector('[data-readout]')!;
    fireEvent.pointerEnter(rows[0]);
    expect(readout.textContent).toBe('Fare-free: 63 agencies');
    expect(rows[0]).toHaveAttribute('data-lit');
    fireEvent.pointerLeave(readout.parentElement!);
    expect(readout.textContent).toBe('');
    expect(container.querySelectorAll('[data-lit]')).toHaveLength(0);
  });

  it('splits all 553 agencies into one bar by policy, counts in the legend (CIV-1176)', () => {
    render(<FreeChildFaresPage />);
    const bar = screen.getByRole('group', { name: 'How many agencies have each kind of free child fare policy, out of 553.' });
    const parts = [...bar.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
    expect(parts).toEqual([
      '374 agencies: Age limit', '63 agencies: Fare-free', '39 agencies: Height limit',
      '24 agencies: Student program', '4 agencies: Program only', '15 agencies: None', '34 agencies: Not found',
    ]);
    expect(parts.reduce((sum, p) => sum + Number(p!.split(' ')[0]), 0)).toBe(553);
  });

  it('opens with the three key figures, each straight from the data', () => {
    const { container } = render(<FreeChildFaresPage />);
    const figure = (label: string) => [...container.querySelectorAll('dt')].find(dt => dt.textContent === label)?.nextElementSibling?.textContent;
    expect(figure('Free up to age 5')).toBe('129');
    expect(figure('Free up to age 18')).toBe('47');
    expect(figure('Free for everyone')).toBe('63');
  });

  it('is a card on the Research page, labelled Data; the others are a Map and a Story (CIV-1167)', () => {
    render(<ResearchPage />);
    const card = (name: RegExp) => screen.getByRole('link', { name });
    expect(card(/Overnight service/)).toHaveTextContent(/^Map/);
    expect(card(/Frequent service/)).toHaveTextContent(/^Story/);
    expect(card(/Free child fares/)).toHaveTextContent(/^Data/);
    expect(screen.queryByRole('heading', { name: 'Stories' })).toBeNull();
    expect(card(/Free child fares/)).toHaveAttribute('href', '/research/free-child-fares');
    expect(card(/Free child fares/)).toHaveTextContent('Up to what age children ride free on transit in Canada and the US, and which systems are free for everyone.');
  });
});
