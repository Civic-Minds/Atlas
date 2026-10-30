import type { CSSProperties } from 'react';

/**
 * The map's fixed overlays, placed against each other in one table (CIV-1136, from CIV-1011 #12): the bottom-edge rows
 * from the edge up, the side insets, and the slot each overlay sits in. Every slot below is built from these, so moving
 * a row moves every overlay that sits on or above it. scripts/check-overlay-overlap.mjs measures the slots at 360, 390,
 * 768, 1024 and 1280 in each map mode and fails on any overlap; each overlay carries `data-map-overlay="<name>"` for it.
 *
 * Tailwind reads class names from the source, so every class here is written out whole, never pieced together.
 */
export const MAP_OVERLAY_ROWS = {
  /** The bottom edge: the footer pills, the map controls. Every edge is the same 1.5rem (6) inset. */
  edge: 'bottom-6',
  /** sm and up: one row above the footer, however far its pills wrap (the map key): its measured height, one row (2rem)
   *  until measured (CIV-1136). */
  aboveFooter: 'sm:bottom-[calc(2rem+var(--map-footer-h,2rem))]',
  /** Phones: the row above the footer pills (the loading and count pills). */
  phoneCounts: 'max-sm:bottom-16',
  /** Phones: the row above the counts (the map key). */
  phoneAboveCounts: 'max-sm:bottom-[6.5rem]',
  /** The notice pill, one row above the footer: phones above the counts, sm and up above the footer's measured height;
   *  above the map key too when the key shows (--map-key-h, 0 without it; CIV-1136). */
  notice: 'bottom-[calc(6.5rem+var(--map-key-h,0px))] sm:bottom-[calc(2rem+var(--map-footer-h,2rem)+var(--map-key-h,0px))]',
  /** The notice pill one row higher still (and the update banner, so the two never meet). */
  noticeRaised: 'bottom-[calc(9rem+var(--map-key-h,0px))] sm:bottom-[calc(4.5rem+var(--map-footer-h,2rem)+var(--map-key-h,0px))]',
  /** App-level status pills, just inside the bottom edge. */
  status: 'bottom-5',
} as const;

/** The side insets. */
export const MAP_OVERLAY_EDGES = {
  left: 'left-6',
  phoneLeft: 'max-sm:left-6',
  /** The footer row stops short of the map controls. */
  footerRight: 'right-14',
  /** History's year scrubber, in the bottom-right corner beside the controls. */
  scrubberRight: 'right-14',
  /** Compare (sm and up): the footer row stops the same 1.5rem short of the divider, 2px right of centre (CIV-1137). */
  compareFooterRight: 'right-[calc(50%+2px+1.5rem)]',
  controlsRight: 'right-3 max-sm:right-6',
  /** The notice pill stays clear of the controls (and, on sm and up, of the counts). */
  noticeSides: 'left-6 right-24 sm:right-56',
} as const;

const R = MAP_OVERLAY_ROWS, E = MAP_OVERLAY_EDGES;

/**
 * The measured sizes the rows read, published on the page root so every overlay can read them, inside the map or not
 * (History and the update banner sit outside the map app): the footer row's height, and the map key's height plus its
 * gap (absent without a key).
 */
export const MAP_OVERLAY_VARS = { footerHeight: '--map-footer-h', keyHeight: '--map-key-h' } as const;
export function publishMapOverlayVar(name: (typeof MAP_OVERLAY_VARS)[keyof typeof MAP_OVERLAY_VARS], value: string | null): void {
  if (typeof document === 'undefined') return;
  if (value == null) document.documentElement.style.removeProperty(name);
  else document.documentElement.style.setProperty(name, value);
}

/** The header row: logo and search on the left, mode tabs and buttons on the right. */
export const MAP_TOP_BAR_SLOT = 'top-6 left-6 right-6 h-[28px]';
/** sm and up: the bottom-left pills and the bottom-right counts share one row, so the pills wrap upward before the counts. Phones drop it (contents). */
export const MAP_FOOTER_ROW_SLOT = `max-sm:contents absolute ${R.edge} ${E.left} ${E.footerRight} flex items-end justify-between gap-2 pointer-events-none`;
/** sm and up: the footer row's right end, the on-demand failed notice (768 up) then the counts (CIV-1057). Phones drop it (contents). */
export const MAP_FOOTER_RIGHT_SLOT = 'max-sm:contents ml-auto shrink-0 flex items-end gap-2';
/** 768 and up: the on-demand failed notice in the footer row, beside the agencies loading pill (CIV-1057). */
export const MAP_FOOTER_NOTICE_SLOT = 'flex shrink-0 pointer-events-none';
/** Compare: the same row over the left map only, so its pills and the analytics prompt wrap upward instead of running
 *  across the divider (CIV-1137). */
export const MAP_FOOTER_ROW_COMPARE_SLOT = `max-sm:contents absolute ${R.edge} ${E.left} ${E.compareFooterRight} flex items-end justify-between gap-2 pointer-events-none`;
/** Phones: the About, What's new and Feedback pills along the bottom edge. */
export const MAP_FOOTER_PILLS_PHONE_SLOT = `max-sm:absolute max-sm:bottom-6 ${E.phoneLeft} max-sm:max-w-[calc(100vw-3rem)]`;
/** Phones: the loading and count pills, one row above the footer pills. */
export const MAP_COUNTS_PHONE_SLOT = `max-sm:absolute ${R.phoneCounts} ${E.phoneLeft}`;
/** The map key (Settings, "Show map legend"): bottom-left above the footer row; phones one row higher, above the
 *  loading and count pills (CIV-1070: the loading pill covered its last row). */
export const MAP_LEGEND_SLOT = `absolute ${R.phoneAboveCounts} ${R.aboveFooter} ${E.left}`;
/** History's year scrubber: the bottom-right corner beside the controls (the overlap check covers it with the footer). */
export const MAP_SCRUBBER_SLOT = `absolute ${R.edge} ${E.scrubberRight}`;
export const MAP_SCRUBBER_WIDTH = 'w-[260px]';
/** The update banner: centred one row above the notice pill, so it never sits on the footer pills or the notice. */
export const MAP_BANNER_SLOT = `fixed left-1/2 -translate-x-1/2 ${R.noticeRaised}`;
/** The locate, export and zoom stack in the bottom-right corner. */
export const MAP_CONTROLS_SLOT = `absolute ${R.edge} ${E.controlsRight}`;
/** A centred notice pill one row above the bottom-left pills, clear of the controls; `raised` sits one row higher
 *  (CIV-1057). Phones put it above the counts row: the "Error" pill, with any other hint raised over it. On sm and up the footer row can wrap upward, so the pill sits
 *  above its measured height (--map-footer-h, from mapFooterStyle on the map app's root). */
export const MAP_NOTICE_SLOT = `absolute ${R.notice} ${E.noticeSides} flex justify-center`;
export const MAP_NOTICE_SLOT_RAISED = `absolute ${R.noticeRaised} ${E.noticeSides} flex justify-center`;
/** Sidebar cards on sm and up stop 7px above the footer row however far it wraps (CIV-1137): 56px top, the row's
 *  1.5rem inset and its measured height (--map-footer-h, published on <html>, so the cards outside the map app see it). */
export const SIDEBAR_CARD_BOTTOM_LIMIT = 'max-h-[calc(100vh-80px-var(--map-footer-h,2rem))]';
/** Phones: while the analytics prompt shows under the header (its bottom edge measured at 92px), the sidebar cards start
 *  below it instead of under the search bar, so it never covers a card's back link (CIV-1137). The gap is the cards' own
 *  8px (gap-2), so the prompt sits like one more card above them (Ryan). */
export const SIDEBAR_CARD_TOP_BELOW_CONSENT = 'max-sm:[html[data-consent-prompt]_&]:top-[100px]';
/** ...and stop at the same place above the bottom pills, 42px shorter. */
export const SIDEBAR_CARD_MAX_H_BELOW_CONSENT = 'max-sm:[html[data-consent-prompt]_&]:max-h-[calc(100dvh-160px)]';
/** The footer row's height before it is measured: one row of pills (h-8). */
export const MAP_FOOTER_HEIGHT_FALLBACK = '2rem';
/** Sets --map-footer-h, the footer row's measured height in px, for the notice slots; the fallback until measured. */
export function mapFooterStyle(footerHeight?: number | null): CSSProperties {
  return { '--map-footer-h': footerHeight ? `${footerHeight}px` : MAP_FOOTER_HEIGHT_FALLBACK } as CSSProperties;
}
/** The analytics prompt where the footer row doesn't draw it: under the header on phones, at the bottom edge otherwise. */
export const MAP_CONSENT_SLOT = 'fixed inset-x-0 top-[4.25rem] mx-auto sm:top-auto sm:bottom-6';
/** App-level status pills (loading the map, a load error), centred along the bottom. */
export const MAP_STATUS_SLOT = `absolute left-1/2 ${R.status} -translate-x-1/2`;
