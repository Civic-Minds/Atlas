import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MapErrorsPill from '../MapErrorsPill';
import { LOCATION_DENIED, MAP_ERRORS_PILL, ON_DEMAND_AREAS_FAILED } from '../../../content/noticeCopy';

describe('MapErrorsPill (CIV-1057, phones)', () => {
  it('shows one "Error" pill for any number of errors, and nothing for none', () => {
    const { rerender, container } = render(<MapErrorsPill messages={[ON_DEMAND_AREAS_FAILED]} />);
    expect(screen.getByRole('button', { name: MAP_ERRORS_PILL })).toBeTruthy();
    expect(container.textContent).toBe(MAP_ERRORS_PILL);
    rerender(<MapErrorsPill messages={[ON_DEMAND_AREAS_FAILED, LOCATION_DENIED]} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    rerender(<MapErrorsPill messages={[]} />);
    expect(container.textContent).toBe('');
  });

  it('lists the messages on a tap and keeps them until it closes', () => {
    const { rerender, container } = render(<MapErrorsPill messages={[ON_DEMAND_AREAS_FAILED, LOCATION_DENIED]} />);
    const pill = screen.getByRole('button', { name: MAP_ERRORS_PILL });
    fireEvent.click(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain(ON_DEMAND_AREAS_FAILED);
    expect(container.textContent).toContain(LOCATION_DENIED);
    // The location hint times out while the list is open: the list keeps it.
    rerender(<MapErrorsPill messages={[ON_DEMAND_AREAS_FAILED]} />);
    expect(container.textContent).toContain(LOCATION_DENIED);
    fireEvent.pointerDown(document.body);
    expect(container.textContent).not.toContain(LOCATION_DENIED);
    expect(screen.getByRole('button', { name: MAP_ERRORS_PILL }).getAttribute('aria-expanded')).toBe('false');
  });
});
