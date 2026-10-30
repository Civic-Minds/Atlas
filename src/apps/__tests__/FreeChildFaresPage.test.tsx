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
    expect([...container.querySelectorAll('footer strong')].map(el => el.textContent)).toEqual(['Date conducted.', 'Sample.', 'Sources.', 'What counted.', 'Not found yet.', 'Limitations.']);
    expect(screen.getByText(/553 in all, 465 in the United States and 88 in Canada\./)).toBeInTheDocument();
  });

  it('draws two charts, each with its own table named by its title', () => {
    render(<FreeChildFaresPage />);
    const tables = screen.getAllByRole('table', { hidden: true });
    expect(tables.map(t => t.querySelector('caption')?.textContent)).toEqual(['Free up to a set age', 'Other policies']);
    expect(tables[0].textContent).toContain('Up to 5');
    expect(tables[0].textContent).not.toContain('Not found yet');
    expect(tables[1].textContent).toContain('Not found yet');
  });

  it('chart rows show the normal arrow, not the text cursor, in both groups', () => {
    // The rows only show a tooltip and a highlight on hover; nothing is clicked, so no pointer either.
    const { container } = render(<FreeChildFaresPage />);
    const rows = [...container.querySelectorAll('li[title]')];
    expect(rows.some(row => row.textContent?.startsWith('Up to 5'))).toBe(true);
    expect(rows.some(row => row.textContent?.startsWith('Not found yet'))).toBe(true);
    for (const row of rows) expect(row).toHaveClass('cursor-default');
  });

  it('is a card on the Research page', () => {
    render(<ResearchPage />);
    const card = screen.getByRole('link', { name: /Free child fares/ });
    expect(card).toHaveAttribute('href', '/research/free-child-fares');
    expect(card).toHaveTextContent('See up to what age children ride free at 553 transit agencies.');
  });
});
