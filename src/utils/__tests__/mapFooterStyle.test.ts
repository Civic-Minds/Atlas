import { describe, expect, it } from 'vitest';
import { MAP_FOOTER_HEIGHT_FALLBACK, MAP_NOTICE_SLOT, MAP_NOTICE_SLOT_RAISED, mapFooterStyle } from '../../styles';

// CIV-1057: the map notice pill sits above the bottom-left pills, never on their row.
describe('mapFooterStyle', () => {
  it('uses the measured footer row height', () => {
    expect(mapFooterStyle(72)).toEqual({ '--map-footer-h': '72px' });
  });

  it('falls back to one row of pills before it is measured', () => {
    expect(mapFooterStyle(undefined)).toEqual({ '--map-footer-h': MAP_FOOTER_HEIGHT_FALLBACK });
    expect(mapFooterStyle(null)).toEqual({ '--map-footer-h': MAP_FOOTER_HEIGHT_FALLBACK });
    expect(mapFooterStyle(0)).toEqual({ '--map-footer-h': MAP_FOOTER_HEIGHT_FALLBACK });
  });
});

describe('map notice slots', () => {
  it('sit above the measured footer row on sm and up', () => {
    expect(MAP_NOTICE_SLOT).toContain('sm:bottom-[calc(2rem+var(--map-footer-h))]');
    expect(MAP_NOTICE_SLOT_RAISED).toContain('sm:bottom-[calc(4.5rem+var(--map-footer-h))]');
  });

  it('sit above the pills (bottom-6) and counts (bottom-16) rows on phones', () => {
    expect(MAP_NOTICE_SLOT).toMatch(/(^| )bottom-\[6\.5rem\]/);
    expect(MAP_NOTICE_SLOT_RAISED).toMatch(/(^| )bottom-\[9rem\]/);
    expect(MAP_NOTICE_SLOT).not.toMatch(/(^| )bottom-6( |$)/);
  });
});
