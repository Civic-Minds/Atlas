import { describe, expect, it } from 'vitest';
import { placeParts, stopMatchText } from '../stopNameText';

describe('stop name matching text (CIV-1864)', () => {
  it('reads Stn and St the long way and drops punctuation', () => {
    expect(stopMatchText('Finch Stn - Bay 3')).toBe('finch station bay 3');
    expect(stopMatchText('King St. W')).toBe('king street w');
  });
  it('splits a corner into its streets', () => {
    expect(placeParts('Bathurst and Bloor')).toEqual(['bathurst', 'bloor']);
    expect(placeParts('King St & Spadina')).toEqual(['king street', 'spadina']);
    expect(placeParts('Main at Queen / Union Stn')).toEqual(['main', 'queen', 'union station']);
  });
});
