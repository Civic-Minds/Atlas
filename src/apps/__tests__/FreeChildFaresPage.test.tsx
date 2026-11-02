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
    expect(screen.getByText(/All 553 agencies Atlas covered on that date: 465 in the United States and 88 in Canada\./)).toBeInTheDocument();
    expect(screen.getByText(/^Only an agency's own fare page, or its city or county fare bylaw, counted\.$/)).toBeInTheDocument();
  });

  it('draws the ages and the other policies as two separate charts, each with its own table (CIV-1176)', () => {
    render(<FreeChildFaresPage />);
    const captions = screen.getAllByRole('table', { hidden: true }).map(t => t.querySelector('caption')?.textContent);
    expect(captions).toContain('Free up to a set age');
    expect(captions).toContain('Other policies');
    const ages = screen.getByRole('group', { name: 'How many agencies let children ride free up to each age, from 1 to 18. Age 5 is the most common, at 129 agencies.' });
    expect(ages).toBeInTheDocument();
    const other = screen.getAllByRole('table', { hidden: true }).find(t => t.querySelector('caption')?.textContent === 'Other policies')!;
    expect(other.textContent).toContain('Not found');
    expect(other.textContent).not.toContain('Up to 5');
  });

  it('gives every age from 1 to 18 a column, with no bar where no agency uses it, and counts above the bars (#1290)', () => {
    const { container } = render(<FreeChildFaresPage />);
    const chart = screen.getByRole('group', { name: /How many agencies let children ride free up to each age/ });
    const columns = [...chart.children];
    expect(columns).toHaveLength(18);
    expect(chart.querySelectorAll('button')).toHaveLength(16);
    expect(chart.querySelector('[title]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Up to 5: 129 agencies' })).toHaveTextContent('129');
    expect(screen.getByRole('button', { name: 'Up to 1: 1 agency' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Up to 15:/ })).toBeNull();
    expect(container.querySelector('[data-readout]')).toBeNull();
  });

  it('picks a column the way the split bar picks a part: the others fade and its name is highlighted (#1290)', () => {
    render(<FreeChildFaresPage />);
    const chart = screen.getByRole('group', { name: 'How many agencies have each other free child fare policy.' });
    const columns = [...chart.querySelectorAll('button')];
    expect(columns.map(b => b.getAttribute('aria-label'))).toEqual(['Fare-free: 63 agencies', 'Height limit: 39 agencies', 'Student program: 24 agencies', 'Program only: 4 agencies', 'None: 15 agencies', 'Not found: 34 agencies']);
    const bar = (b: HTMLElement) => b.firstElementChild as HTMLElement;
    expect(bar(columns[5]).style.background).toContain('repeating-linear-gradient');
    const names = chart.parentElement!.nextElementSibling!;
    fireEvent.mouseEnter(columns[1]);
    expect(bar(columns[1]).style.opacity).toBe('');
    expect(bar(columns[0]).style.opacity).toBe('0.35');
    expect(names.querySelector('[data-active]')).toHaveTextContent('Height limit');
    fireEvent.mouseLeave(chart.closest('figure')!.firstElementChild!);
    expect(bar(columns[0]).style.opacity).toBe('');
    fireEvent.click(columns[2]);
    expect(names.querySelector('[data-active]')).toHaveTextContent('Student program');
    fireEvent.click(columns[2]);
    expect(names.querySelector('[data-active]')).toBeNull();
    // A tap fires the hover first: it picks the column rather than undoing that hover.
    fireEvent.mouseEnter(columns[3]);
    fireEvent.click(columns[3]);
    expect(names.querySelector('[data-active]')).toHaveTextContent('Program only');
    fireEvent.mouseLeave(names.querySelector('[data-active]')!);
    expect(names.querySelector('[data-active]')).toBeNull();
    // Tabbing to a column picks it, and Enter (a click) keeps it picked.
    fireEvent.focus(columns[4]);
    fireEvent.click(columns[4]);
    expect(names.querySelector('[data-active]')).toHaveTextContent('None');
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
