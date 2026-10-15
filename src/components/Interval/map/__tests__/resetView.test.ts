import { describe, expect, it } from 'vitest';
import { shouldApplyResetView } from '../resetView';

describe('shouldApplyResetView (CIV-213)', () => {
  it('never refits on load, so a URL position or saved view is kept exactly', () => {
    // The app no longer passes the key: loading /?lat=41.4153&lon=-81.47704&z=10.16 fitted the
    // map to every agency (z3 over North America) about ten seconds after it opened on Cleveland.
    expect(shouldApplyResetView(undefined, undefined)).toBe(false);
    expect(shouldApplyResetView(0, undefined)).toBe(false);
  });

  it('refits once per press of the reset control, not again when agencies change', () => {
    expect(shouldApplyResetView(1, undefined)).toBe(true);
    expect(shouldApplyResetView(1, 1)).toBe(false);
    expect(shouldApplyResetView(2, 1)).toBe(true);
  });
});
