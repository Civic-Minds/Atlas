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

describe('a separately run service in focus (#1440)', () => {
  const target = { slug: 'hamilton', zoneId: null, zoneIds: ['West Glanbrook', 'Lower East Stoney Creek'] };
  it("keeps that service's zones and their stops, and fades the rest of the agency", () => {
    expect(isOnDemandZoneFocused(target, 'hamilton', 'West Glanbrook')).toBe(true);
    expect(isOnDemandZoneFocused(target, 'hamilton', 'Waterdown')).toBe(false);
    expect(isOnDemandStopFocused(target, 'hamilton', ['Lower East Stoney Creek'])).toBe(true);
    expect(isOnDemandStopFocused(target, 'hamilton', [])).toBe(false);
  });
});
