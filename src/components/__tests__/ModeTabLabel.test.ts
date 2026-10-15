import { describe, expect, it } from 'vitest';
import { modeTabCollapsed, modeTabSpacing } from '../ModeTabLabel';

describe('mode tabs shrink to icons while any non-map view is on', () => {
  it('collapses the unselected tabs, never the selected one', () => {
    expect(modeTabCollapsed(true, true, false)).toBe(true);
    expect(modeTabCollapsed(true, true, true)).toBe(false);
  });

  it('expands every tab on the plain map, or when the feature is off (public)', () => {
    expect(modeTabCollapsed(true, false, false)).toBe(false);
    expect(modeTabCollapsed(false, true, false)).toBe(false);
  });

  it('drops the gap and tightens padding when collapsed', () => {
    expect(modeTabSpacing(true)).toBe('px-2.5 gap-0');
    expect(modeTabSpacing(false)).toBe('px-3 gap-1.5');
  });
});
