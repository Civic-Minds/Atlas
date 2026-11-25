import { describe, expect, it } from 'vitest';
import { networkCountFrom } from '../useNetworkInService';

// CIV-2182, CIV-2939: Fleet's "In service now" shows the recorder's whole-network count only when there is a recent one;
// otherwise the row is left out (never a dash).
describe('networkCountFrom', () => {
  it('shows a recent count', () => expect(networkCountFrom({ vehicles: 1828, ageSec: 90 })).toBe(1828));
  it('leaves the row out for an agency with no count (Kingston answers 404)', () => expect(networkCountFrom(null)).toBeNull());
  it('leaves the row out when the latest count is more than two minutes old', () => expect(networkCountFrom({ vehicles: 216, ageSec: 121 })).toBeNull());
  it('leaves the row out without an age', () => expect(networkCountFrom({ vehicles: 216 })).toBeNull());
});
