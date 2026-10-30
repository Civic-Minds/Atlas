import { render, screen } from '@testing-library/react';
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
    expect(screen.getAllByText('Not found yet').length).toBeGreaterThan(0);
    // Once in the note under the charts, once in How we did this.
    expect(screen.getAllByText(/We couldn't find a current official rule for 34 agencies\./)).toHaveLength(2);
    expect(screen.getAllByText('Show as a table')).toHaveLength(2);
  });

  it('opens with the approved blurb and ends with How we did this, Canada and US numbers', () => {
    const { container } = render(<FreeChildFaresPage />);
    expect(screen.getByText('We read the official fare rules of 553 transit agencies in Canada and the United States to find up to what age children ride free, and under what conditions.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How we did this' })).toBeInTheDocument();
    expect([...container.querySelectorAll('[data-research-method] strong')].map(el => el.textContent)).toEqual(['Date conducted.', 'Sample.', 'Sources.', 'What counted.', 'Not found yet.', 'Limitations.']);
    expect(screen.getByText(/553 in all, 465 in the United States and 88 in Canada\./)).toBeInTheDocument();
  });

  it('draws the ages and the other policies as two separate charts, each with its own table (CIV-1176)', () => {
    render(<FreeChildFaresPage />);
    const captions = screen.getAllByRole('table', { hidden: true }).map(t => t.querySelector('caption')?.textContent);
    expect(captions).toContain('Free up to a set age');
    expect(captions).toContain('Other policies');
    const ages = screen.getByRole('img', { name: /oldest age that rides free/ });
    expect(ages).toBeInTheDocument();
    const other = screen.getAllByRole('table', { hidden: true }).find(t => t.querySelector('caption')?.textContent === 'Other policies')!;
    expect(other.textContent).toContain('Not found yet');
    expect(other.textContent).not.toContain('Up to 5');
  });

  it('gives every age from 1 to 18 a column, ages no agency uses at zero', () => {
    const { container } = render(<FreeChildFaresPage />);
    const columns = [...container.querySelectorAll('[role="img"] [title]')].map(el => el.getAttribute('title'));
    expect(columns).toHaveLength(18);
    expect(columns).toContain('Up to 5: 129');
    expect(columns).toContain('Up to 15: 0');
    expect(columns).toContain('Up to 18: 47');
  });

  it('other policies rows show the normal arrow, not the text cursor, and the stripes for not found', () => {
    const { container } = render(<FreeChildFaresPage />);
    const rows = [...container.querySelectorAll('li[title]')];
    expect(rows.map(row => row.textContent?.replace(/\d+$/, ''))).toEqual(['Free for everyone', 'Free below a height', 'Through a student program', 'Only under a program', 'No free child fare', 'Not found yet']);
    for (const row of rows) expect(row).toHaveClass('cursor-default');
    expect((rows[5].querySelector('div > div') as HTMLElement).style.background).toContain('repeating-linear-gradient');
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
    expect(card(/Free child fares/)).toHaveTextContent('See up to what age children ride free.');
  });
});
