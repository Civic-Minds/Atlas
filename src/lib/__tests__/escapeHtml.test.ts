import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../escapeHtml';
import { vehicleTooltipHtml } from '../../components/Interval/map/useLiveVehiclesLayer';
import { StopCardHtml, VehicleMarkerHtml } from '../mapHtml';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';
import type { HistoryMapStop } from '../../context/HistoryMapOverlay';

function vehicle(partial: Partial<LiveVehicle> & Pick<LiveVehicle, 'routeShortName'>): LiveVehicle {
  return {
    id: '1',
    displayName: partial.routeShortName,
    tripId: 't1',
    lat: 0,
    lon: 0,
    bearing: null,
    speedKmh: null,
    tsEpoch: null,
    delayMin: null,
    headsign: null,
    directionId: null,
    vehicleLabel: null,
    status: 'no_data',
    agencySlug: 'test',
    ...partial,
  };
}

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml(`a & b`)).toBe('a &amp; b');
    expect(escapeHtml(`it's`)).toBe('it&#39;s');
  });

  it('treats null/undefined as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('map HTML builders escape untrusted feed text', () => {
  it('vehicleTooltipHtml escapes headsign and route label', () => {
    const html = vehicleTooltipHtml(
      vehicle({ routeShortName: '<img>', headsign: '<script>x</script>' }),
    );
    expect(html).toBeTruthy();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img&gt;');
  });

  it('StopCardHtml escapes stop name', () => {
    const stop: HistoryMapStop = {
      stopId: 's1<script>',
      name: '<b>Inject</b>',
      lat: 0,
      lon: 0,
      headwayDeltaMin: null,
      avgGap: null,
      scheduledHeadwayMin: null,
    };
    const html = StopCardHtml(stop, false);
    expect(html).not.toContain('<b>Inject</b>');
    expect(html).toContain('&lt;b&gt;Inject&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;');
  });

  it('VehicleMarkerHtml escapes route short name', () => {
    const html = VehicleMarkerHtml(vehicle({ routeShortName: '<x>', status: 'on_time' }));
    expect(html).not.toContain('<x>');
    expect(html).toContain('&lt;x&gt;');
  });
});
