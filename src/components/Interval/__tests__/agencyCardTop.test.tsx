import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AgencyCardTop } from '../cardUi';

const noop = { to: 'Map', onClick: () => {} };

describe('AgencyCardTop', () => {
  it('shows the agency name with its place on the same line', () => {
    render(<AgencyCardTop as="h2" name="MARTA" place="Atlanta" back={noop} />);
    expect(screen.getByRole('heading').textContent).toBe('MARTA Atlanta');
  });

  it('leaves the place out when there is none', () => {
    render(<AgencyCardTop name="TTC" back={noop} />);
    expect(screen.getByText('TTC').textContent).toBe('TTC');
  });

  it('shows the back link as the arrow plus its destination and calls it on click', () => {
    const onBack = vi.fn();
    render(<AgencyCardTop name="MARTA" place="Atlanta" back={{ to: 'All agencies', onClick: onBack }} />);
    fireEvent.click(screen.getByRole('button', { name: '← All agencies' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows one facts line and the report control beside the top', () => {
    render(<AgencyCardTop name="TTC" back={noop} facts="230 routes · 172 match filters" report={<button type="button">Report</button>} />);
    expect(screen.getByText('230 routes · 172 match filters')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report' })).toBeTruthy();
  });
});
