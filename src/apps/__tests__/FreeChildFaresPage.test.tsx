import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FreeChildFaresPage from '../FreeChildFaresPage';
import ResearchPage from '../ResearchPage';

describe('Free child fares (CIV-1149)', () => {
  it('shows the approved heading, both groups, the note and the table link', () => {
    render(<FreeChildFaresPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Free child fares' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Where kids ride free, age 5 is the most common cutoff.' })).toBeInTheDocument();
    expect(screen.getByText('487 of 697 agencies let children ride free up to a set age. Each bar counts the agencies whose free fare ends at that age.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Free up to a set age' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other policies' })).toBeInTheDocument();
    expect(screen.getAllByText('Up to 5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not found yet').length).toBeGreaterThan(0);
    expect(screen.getByText(/We couldn't find a current official rule for 41 agencies\./)).toBeInTheDocument();
    expect(screen.getByText('Show as a table')).toBeInTheDocument();
  });

  it('is a card on the Research page', () => {
    render(<ResearchPage />);
    const card = screen.getByRole('link', { name: /Free child fares/ });
    expect(card).toHaveAttribute('href', '/research/free-child-fares');
    expect(card).toHaveTextContent('See up to what age children ride free at 697 transit agencies.');
  });
});
