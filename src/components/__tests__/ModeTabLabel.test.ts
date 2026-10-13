import { describe, expect, it } from 'vitest';
import { modeTabCollapsed, modeTabSpacing } from '../ModeTabLabel';

describe('mode tabs shrink to icons while another mode is on', () => {
  it('collapses the other tabs, never the active one', () => {
    expect(modeTabCollapsed(true, 'compare', 'history')).toBe(true);
    expect(modeTabCollapsed(true, 'compare', 'compare')).toBe(false);
    expect(modeTabCollapsed(true, 'history', 'live')).toBe(true);
  });

  it('expands every tab when no mode is on, or when the feature is off (public)', () => {
    expect(modeTabCollapsed(true, null, 'history')).toBe(false);
    expect(modeTabCollapsed(false, 'compare', 'history')).toBe(false);
  });

  it('drops the gap and tightens padding when collapsed', () => {
    expect(modeTabSpacing(true)).toBe('px-2.5 gap-0');
    expect(modeTabSpacing(false)).toBe('px-3 gap-1.5');
  });
});
