import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgencyCardHeading } from '../cardUi';

describe('AgencyCardHeading', () => {
  it('shows the agency name with its place on the same line', () => {
    render(<AgencyCardHeading as="h2" name="MARTA" place="Atlanta" />);
    expect(screen.getByRole('heading').textContent).toBe('MARTA Atlanta');
  });

  it('leaves the place out when there is none', () => {
    render(<AgencyCardHeading name="TTC" />);
    expect(screen.getByText('TTC').textContent).toBe('TTC');
  });

  it('shows the back link as the arrow plus its destination and calls it on click', () => {
    const onBack = vi.fn();
    render(<AgencyCardHeading name="MARTA" place="Atlanta" back={{ to: 'All agencies', onClick: onBack }} />);
    fireEvent.click(screen.getByRole('button', { name: '← All agencies' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
