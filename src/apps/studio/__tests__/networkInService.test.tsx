import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { networkCountFrom } from '../useNetworkInService';
import { FleetNowTable } from '../Fleet';

// CIV-2182, CIV-2939: Fleet's "In service now" shows the recorder's whole-network count only when there is a recent one;
// otherwise the row is left out (never a dash).
describe('networkCountFrom', () => {
  it('shows a recent count', () => expect(networkCountFrom({ vehicles: 1828, ageSec: 90 })).toEqual({ onTrip: 1828, noTrip: null }));
  it('leaves the row out for an agency with no count (Kingston answers 404)', () => expect(networkCountFrom(null)).toBeNull());
  it('leaves the row out when the latest count is more than two minutes old', () => expect(networkCountFrom({ vehicles: 216, noTrip: 3, ageSec: 121 })).toBeNull());
  it('leaves the row out without an age', () => expect(networkCountFrom({ vehicles: 216 })).toBeNull());
  // CIV-2939 (Ryan, 2026-11-25: "1"): "Not on a trip" only where the feed reports such vehicles, never 0.
  it('keeps the vehicles with no trip where the feed reports any', () => expect(networkCountFrom({ vehicles: 1600, noTrip: 238, ageSec: 30 })).toEqual({ onTrip: 1600, noTrip: 238 }));
  it('leaves "Not on a trip" out at 0', () => expect(networkCountFrom({ vehicles: 216, noTrip: 0, ageSec: 30 })).toEqual({ onTrip: 216, noTrip: null }));
});

describe('Fleet\'s now table: Not on a trip (CIV-2939)', () => {
  const rowHeaders = () => screen.getAllByRole('rowheader').map(h => h.textContent);
  it('puts the quieter row straight under "In service now", its own figure, not added into the total', () => {
    render(<FleetNowTable modes={[3]} runningNow={{ onTrip: 1600, noTrip: 238 }} scheduledNow={1790} />);
    expect(rowHeaders()).toEqual(['In service now', '238 not on a trip', 'Scheduled now']);
    const row = screen.getByText('238 not on a trip').closest('tr')!;
    expect(row.textContent).toBe('238 not on a trip');
    expect(row.className).toContain('text-[var(--text-muted)]');
    expect(screen.getByText('In service now').closest('tr')!.textContent).toBe('In service now1,600');
    expect(screen.getByText('In service now').closest('tr')!.className).not.toContain('text-muted');
  });
  it('has no row where the feed reports none', () => {
    render(<FleetNowTable modes={[3]} runningNow={{ onTrip: 216, noTrip: null }} scheduledNow={null} />);
    expect(rowHeaders()).toEqual(['In service now']);
  });
});

// #1832: the table's screen-reader caption names the vehicles as the visible title does ("Vehicles needed" for the TTC's
// mixed modes), never a hidden "Buses needed" beside it.
describe('Fleet\'s now table caption (#1832)', () => {
  it('follows the modes', () => {
    const { container, unmount } = render(<FleetNowTable modes={[1, 3]} runningNow={{ onTrip: 797, noTrip: 682 }} scheduledNow={1096} />);
    expect(container.querySelector('caption')?.textContent).toBe('Vehicles needed');
    unmount();
    const bus = render(<FleetNowTable modes={[3]} runningNow={{ onTrip: 216, noTrip: null }} scheduledNow={null} />);
    expect(bus.container.querySelector('caption')?.textContent).toBe('Buses needed');
  });
});

// CIV-2990's count, CIV-3180's layout (#1940; Ryan, 2026-11-28): number first on two lines, "622 not on a trip" then
// "521 at garages"; the first line alone where none are at a garage.
describe('Fleet\'s "not on a trip" lines (CIV-2990, CIV-3180)', () => {
  it('reads "622 not on a trip" above "521 at garages", and the first line alone where none are', () => {
    expect(networkCountFrom({ vehicles: 717, noTrip: 622, atGarage: 521, ageSec: 20 })).toEqual({ onTrip: 717, noTrip: 622, atGarage: 521 });
    const { unmount } = render(<FleetNowTable modes={[3]} runningNow={{ onTrip: 717, noTrip: 622, atGarage: 521 }} scheduledNow={null} />);
    const row = screen.getByText('622 not on a trip').closest('tr')!;
    expect([...row.querySelectorAll('span.block')].map(s => s.textContent)).toEqual(['622 not on a trip', '521 at garages']);
    unmount();
    render(<FleetNowTable modes={[3]} runningNow={{ onTrip: 717, noTrip: 30 }} scheduledNow={null} />);
    expect(screen.getByText('30 not on a trip').closest('tr')!.textContent).toBe('30 not on a trip');
  });
});
