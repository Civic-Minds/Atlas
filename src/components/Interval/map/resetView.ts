/**
 * Whether the Reset View effect should refit the map (CIV-213). Only a press of the reset control
 * does: a key above 0 that has not been applied yet. A missing key (the app stopped passing it when
 * the logo became a home button, 2ae271d8) or 0 is the initial load, so a shared link's lat/lon/z,
 * or the saved view, is kept; and a change of the agency list alone never refits again.
 */
export function shouldApplyResetView(resetViewKey: number | undefined, appliedKey: number | undefined): boolean {
  return typeof resetViewKey === 'number' && resetViewKey > 0 && resetViewKey !== appliedKey;
}
