import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MapErrorsPanel, MapErrorsPill } from '../MapErrorsPill';
import { LOCATION_DENIED, MAP_ERRORS_PILL, MAP_ERRORS_TITLE, ON_DEMAND_AREAS_FAILED } from '../../../content/noticeCopy';

describe('MapErrorsPill (CIV-1057, phones)', () => {
  it('is one "Error" pill that says whether its card is open and toggles it', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<MapErrorsPill open={false} onToggle={onToggle} />);
    const pill = screen.getByRole('button', { name: MAP_ERRORS_PILL });
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<MapErrorsPill open onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: MAP_ERRORS_PILL }).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a card that lists every message under its title', () => {
    render(<MapErrorsPanel messages={[ON_DEMAND_AREAS_FAILED, LOCATION_DENIED]} />);
    const panel = screen.getByTestId('map-errors-panel');
    expect(panel.textContent).toContain(MAP_ERRORS_TITLE);
    expect(panel.textContent).toContain(ON_DEMAND_AREAS_FAILED);
    expect(panel.textContent).toContain(LOCATION_DENIED);
  });
});
