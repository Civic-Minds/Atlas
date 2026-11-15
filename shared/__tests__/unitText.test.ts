import { describe, expect, it } from 'vitest';
import { densityText, metresText, speedText } from '../unitText';

// CIV-1590: distances, speeds and densities (docs/style/TEXT.md "Numbers").
describe('units', () => {
  it('distances in whole metres, so the words match the distance a filter uses', () => {
    expect(metresText(400)).toBe('400 m');
    expect(metresText(347.4)).toBe('347 m');
    expect(metresText(1250)).toBe('1,250 m');
  });

  it('speeds in whole km/h', () => {
    expect(speedText(25)).toBe('25 km/h');
  });

  it('densities to a tenth under 10, whole numbers from 10', () => {
    expect(densityText(5.27)).toBe('5.3');
    expect(densityText(9.96)).toBe('10.0');
    expect(densityText(1234.4)).toBe('1,234');
  });
});
