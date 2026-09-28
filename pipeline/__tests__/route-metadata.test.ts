import { describe, expect, it } from 'vitest';
import { detectBusSubType } from '../route-metadata';

describe('detectBusSubType', () => {
  it('recognizes explicit BRT branding and RapidRide', () => {
    expect(detectBusSubType('3', '302', 'BRT Southeast/City Centre')).toBe('brt');
    expect(detectBusSubType('3', 'G Line', 'G-Line Rapid Ride')).toBe('brt');
    expect(detectBusSubType('3', 'G Line', 'G-Line RapidRide')).toBe('brt');
  });

  it('does not infer BRT from generic Rapid branding', () => {
    expect(detectBusSubType('3', '14R', 'MISSION RAPID', 'sfmta')).toBe('local');
    expect(detectBusSubType('3', '522', 'Palo Alto TC - Eastridge Rapid', 'vta')).toBe('local');
  });

  it('classifies extended Express Bus type 702 as Express', () => {
    expect(detectBusSubType('702', 'X19', 'Wokingham-Heathrow')).toBe('express');
  });
});
