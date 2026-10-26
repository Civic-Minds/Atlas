import { describe, expect, it } from 'vitest';
import { SIDEBAR_LEFT_FALLBACK, sidebarFrameStyle } from '../../styles';

describe('sidebarFrameStyle', () => {
  it('uses the measured left edge and the search bar width', () => {
    expect(sidebarFrameStyle(240, 360)).toEqual({ '--sidebar-left': '240px', width: '360px', maxWidth: 'none' });
  });

  it('falls back to the default left edge before it is measured', () => {
    expect(sidebarFrameStyle(undefined, 360)).toEqual({ '--sidebar-left': `${SIDEBAR_LEFT_FALLBACK}px`, width: '360px', maxWidth: 'none' });
    expect(sidebarFrameStyle(null)).toEqual({ '--sidebar-left': `${SIDEBAR_LEFT_FALLBACK}px` });
  });

  it('leaves the width to the card classes when there is no search bar width (phones)', () => {
    expect(sidebarFrameStyle(240)).toEqual({ '--sidebar-left': '240px' });
    expect(sidebarFrameStyle(240, 0)).toEqual({ '--sidebar-left': '240px' });
  });
});
