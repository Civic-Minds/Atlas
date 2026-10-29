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
  /** sm and up: one row above a one-row footer (the map key). */
  aboveFooter: 'bottom-16',
  /** Phones: the row above the footer pills (the loading and count pills). */
  phoneCounts: 'max-sm:bottom-16',
  /** Phones: the row above the counts (the map key). */
  phoneAboveCounts: 'max-sm:bottom-[6.5rem]',
  /** The notice pill, one row above the footer: phones above the counts, sm and up above the footer's measured height. */
  notice: 'bottom-[6.5rem] sm:bottom-[calc(2rem+var(--map-footer-h))]',
  /** The notice pill one row higher still. */
  noticeRaised: 'bottom-[9rem] sm:bottom-[calc(4.5rem+var(--map-footer-h))]',
  /** App-level status pills, just inside the bottom edge. */
  status: 'bottom-5',
} as const;

/** The side insets. */
export const MAP_OVERLAY_EDGES = {
  left: 'left-6',
  phoneLeft: 'max-sm:left-6',
  /** The footer row stops short of the map controls. */
  footerRight: 'right-14',
  controlsRight: 'right-3 max-sm:right-6',
  /** The notice pill stays clear of the controls (and, on sm and up, of the counts). */
  noticeSides: 'left-6 right-24 sm:right-56',
} as const;

const R = MAP_OVERLAY_ROWS, E = MAP_OVERLAY_EDGES;

/** The header row: logo and search on the left, mode tabs and buttons on the right. */
export const MAP_TOP_BAR_SLOT = 'top-6 left-6 right-6 h-[28px]';
/** sm and up: the bottom-left pills and the bottom-right counts share one row, so the pills wrap upward before the counts. Phones drop it (contents). */
export const MAP_FOOTER_ROW_SLOT = `max-sm:contents absolute ${R.edge} ${E.left} ${E.footerRight} flex items-end justify-between gap-2 pointer-events-none`;
/** Phones: the About, What's new and Feedback pills along the bottom edge. */
export const MAP_FOOTER_PILLS_PHONE_SLOT = `max-sm:absolute max-sm:bottom-6 ${E.phoneLeft} max-sm:max-w-[calc(100vw-3rem)]`;
/** Phones: the loading and count pills, one row above the footer pills. */
export const MAP_COUNTS_PHONE_SLOT = `max-sm:absolute ${R.phoneCounts} ${E.phoneLeft}`;
/** The map key (Settings, "Show map legend"): bottom-left above the footer row; phones one row higher, above the
 *  loading and count pills (CIV-1070: the loading pill covered its last row). */
export const MAP_LEGEND_SLOT = `absolute ${R.aboveFooter} ${E.left} ${R.phoneAboveCounts}`;
/** The locate, export and zoom stack in the bottom-right corner. */
export const MAP_CONTROLS_SLOT = `absolute ${R.edge} ${E.controlsRight}`;
/** A centred notice pill one row above the bottom-left pills, clear of the controls; `raised` sits one row higher
 *  (CIV-1057). Phones stack it above the counts row. On sm and up the footer row can wrap upward, so the pill sits
 *  above its measured height (--map-footer-h, from mapFooterStyle on the map app's root). */
export const MAP_NOTICE_SLOT = `absolute ${R.notice} ${E.noticeSides} flex justify-center`;
export const MAP_NOTICE_SLOT_RAISED = `absolute ${R.noticeRaised} ${E.noticeSides} flex justify-center`;
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
