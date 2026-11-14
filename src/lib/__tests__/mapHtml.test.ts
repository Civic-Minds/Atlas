import { describe, expect, it } from 'vitest';
import { vehicleTooltipHtml } from '../mapHtml';
import { getVehicleColors } from '../../utils/colors';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

const vehicle = (partial: Partial<LiveVehicle>): LiveVehicle => ({
  id: '1', routeShortName: '504', displayName: '504', tripId: 't1', lat: 0, lon: 0, bearing: null, speedKmh: null,
  tsEpoch: null, delayMin: null, headsign: null, directionId: null, vehicleLabel: null, status: 'no_data', agencySlug: 'ttc',
  ...partial,
});

describe('vehicleTooltipHtml (Live dot hover)', () => {
  it('uses the cards\' schedule text (delayLabel), including the feed\'s own label', () => {
    expect(vehicleTooltipHtml(vehicle({ delayMin: 7, status: 'late' }))).toContain('7 min late');
    expect(vehicleTooltipHtml(vehicle({ delayMin: -3, status: 'early' }))).toContain('3 min early');
    expect(vehicleTooltipHtml(vehicle({ delayMin: 1, status: 'on_time' }))).toContain('On time');
    expect(vehicleTooltipHtml(vehicle({ delayMin: 7, status: 'late', statusLabel: 'Delayed <b>' }))).toContain('Delayed &lt;b&gt;');
    expect(vehicleTooltipHtml(vehicle({}))).not.toContain('Status');
  });

  it('colours the status like the cards, following colour-vision mode', () => {
    const late = vehicle({ delayMin: 7, status: 'late' });
    expect(vehicleTooltipHtml(late)).toContain(getVehicleColors('late').border);
    expect(vehicleTooltipHtml(late, 'friendly')).toContain(getVehicleColors('late', 'friendly').border);
  });
});
