import { describe, expect, it } from 'vitest';
import { isOnDemandStopFocused, isOnDemandZoneFocused } from '../onDemandFocus';

describe('on-demand map focus', () => {
  const service = { slug: 'leamington', zoneId: null };
  const zone = { slug: 'hamilton', zoneId: 'West Glanbrook' };

  it('focuses every zone and stop of a selected service with no zone', () => {
    expect(isOnDemandZoneFocused(service, 'leamington', 'Town')).toBe(true);
    expect(isOnDemandStopFocused(service, 'leamington', [])).toBe(true);
  });

  it('fades other agencies', () => {
    expect(isOnDemandZoneFocused(service, 'cobourg', undefined)).toBe(false);
    expect(isOnDemandStopFocused(zone, 'leamington', ['West Glanbrook'])).toBe(false);
  });

  it('keeps only the selected zone and its stops for a zone selection', () => {
    expect(isOnDemandZoneFocused(zone, 'hamilton', 'West Glanbrook')).toBe(true);
    expect(isOnDemandZoneFocused(zone, 'hamilton', 'Flamborough')).toBe(false);
    expect(isOnDemandStopFocused(zone, 'hamilton', ['West Glanbrook'])).toBe(true);
    expect(isOnDemandStopFocused(zone, 'hamilton', ['Flamborough'])).toBe(false);
    expect(isOnDemandStopFocused(zone, 'hamilton', [])).toBe(false);
  });

  it('keeps a transfer point shared by several zones when one of them is selected', () => {
    expect(isOnDemandStopFocused(zone, 'hamilton', ['Flamborough', 'West Glanbrook'])).toBe(true);
  });

  it('matches unnamed polygons by their numeric id', () => {
    expect(isOnDemandZoneFocused({ slug: 'x', zoneId: '3' }, 'x', 3)).toBe(true);
    expect(isOnDemandZoneFocused({ slug: 'x', zoneId: '3' }, 'x', undefined)).toBe(false);
  });
});
