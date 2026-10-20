import { describe, expect, it } from 'vitest';
import { consentPlacement } from '../consentPlacement';

const base = { isSm: true, pillWidth: 343, viewportHeight: 800 };
// Beta row measured at 21-506px, bottom 779 (bottom-6 on an 800px window).
const row = { right: 506, bottom: 779 };

describe('consentPlacement', () => {
  it('joins the bottom-left pill row, one gap after its last pill, at the same bottom', () => {
    expect(consentPlacement({ ...base, row, viewportWidth: 1024 })).toEqual({ mode: 'row', left: 512, bottom: 21 });
    expect(consentPlacement({ ...base, row, viewportWidth: 1440 })).toEqual({ mode: 'row', left: 512, bottom: 21 });
  });
  it('moves under the top bar when the row has no room before the bottom-right map buttons', () => {
    expect(consentPlacement({ ...base, row, viewportWidth: 800 })).toEqual({ mode: 'top' });
    expect(consentPlacement({ ...base, row, viewportWidth: 640 })).toEqual({ mode: 'top' });
  });
  it('keeps the default place below sm, off the map, or before the pill is measured', () => {
    expect(consentPlacement({ ...base, isSm: false, row, viewportWidth: 1024 })).toEqual({ mode: 'default' });
    expect(consentPlacement({ ...base, row: null, viewportWidth: 1024 })).toEqual({ mode: 'default' });
    expect(consentPlacement({ ...base, pillWidth: 0, row, viewportWidth: 1024 })).toEqual({ mode: 'default' });
  });
});
