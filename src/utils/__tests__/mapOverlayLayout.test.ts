import { describe, expect, it } from 'vitest';
import * as layout from '../../mapOverlayLayout';
import * as styles from '../../styles';

// CIV-1136: every fixed map overlay's slot comes from the one layout table. A slot that changes here is a visible change,
// listed for Ryan. Step 2 changed four, each the same as before until it matters: the footer row stops short of History's
// scrubber (--map-footer-right, 3.5rem otherwise), the key follows the footer's measured height (2rem until measured), and
// the notice pills sit above the key when it shows (--map-key-h, 0 otherwise).
const PINNED = {
    MAP_TOP_BAR_SLOT: "top-6 left-6 right-6 h-[28px]",
    MAP_FOOTER_ROW_SLOT: "max-sm:contents absolute bottom-6 left-6 right-[var(--map-footer-right,3.5rem)] flex items-end justify-between gap-2 pointer-events-none",
    MAP_FOOTER_PILLS_PHONE_SLOT: "max-sm:absolute max-sm:bottom-6 max-sm:left-6 max-sm:max-w-[calc(100vw-3rem)]",
    MAP_COUNTS_PHONE_SLOT: "max-sm:absolute max-sm:bottom-16 max-sm:left-6",
    MAP_LEGEND_SLOT: "absolute max-sm:bottom-[6.5rem] sm:bottom-[calc(2rem+var(--map-footer-h,2rem))] left-6",
    MAP_CONTROLS_SLOT: "absolute bottom-6 right-3 max-sm:right-6",
    MAP_NOTICE_SLOT: "absolute bottom-[calc(6.5rem+var(--map-key-h,0px))] sm:bottom-[calc(2rem+var(--map-footer-h,2rem)+var(--map-key-h,0px))] left-6 right-24 sm:right-56 flex justify-center",
    MAP_NOTICE_SLOT_RAISED: "absolute bottom-[calc(9rem+var(--map-key-h,0px))] sm:bottom-[calc(4.5rem+var(--map-footer-h,2rem)+var(--map-key-h,0px))] left-6 right-24 sm:right-56 flex justify-center",
    MAP_FOOTER_HEIGHT_FALLBACK: "2rem",
    MAP_CONSENT_SLOT: "fixed inset-x-0 top-[4.25rem] mx-auto sm:top-auto sm:bottom-6",
    MAP_STATUS_SLOT: "absolute left-1/2 bottom-5 -translate-x-1/2",
} as const;

describe('map overlay layout', () => {
  it('keeps every slot where it was', () => {
    for (const [name, classes] of Object.entries(PINNED)) expect(layout[name as keyof typeof PINNED]).toBe(classes);
  });
  it('is the only place the slots are defined (styles.ts re-exports it)', () => {
    for (const name of Object.keys(PINNED)) expect(styles[name as keyof typeof styles]).toBe(layout[name as keyof typeof layout]);
  });
  it('builds the bottom slots from the row table', () => {
    const R = layout.MAP_OVERLAY_ROWS;
    expect(layout.MAP_FOOTER_ROW_SLOT).toContain(R.edge);
    expect(layout.MAP_CONTROLS_SLOT).toContain(R.edge);
    expect(layout.MAP_COUNTS_PHONE_SLOT).toContain(R.phoneCounts);
    expect(layout.MAP_LEGEND_SLOT).toContain(R.aboveFooter);
    expect(layout.MAP_LEGEND_SLOT).toContain(R.phoneAboveCounts);
    expect(layout.MAP_NOTICE_SLOT).toContain(R.notice);
    expect(layout.MAP_NOTICE_SLOT_RAISED).toContain(R.noticeRaised);
    expect(layout.MAP_STATUS_SLOT).toContain(R.status);
  });
});
