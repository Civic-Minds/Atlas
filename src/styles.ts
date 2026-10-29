/**
 * Shared structural class constants for Atlas UI primitives.
 * Color tokens live in CSS variables (index.css). These handle shape and surface (nothing has a shadow).
 */

import type { CSSProperties } from 'react';

/** Glass panel surface: background + blur + primary border */
export const SURFACE = 'bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)]';

/**
 * The outline of the map top bar's unselected pills and round buttons (CIV-1020, Ryan: "a light outline"): a little firmer
 * than the panel border so they stand out on the light map; stronger again in high contrast (index.css). Selected pills keep
 * their own edge.
 */
export const TOP_BAR_OUTLINE = 'border-[var(--top-bar-outline)]';
/** The glass surface with the top bar's outline instead of the panel border. */
export const TOP_BAR_SURFACE = `bg-[var(--bg-panel)] backdrop-blur-md border ${TOP_BAR_OUTLINE}`;

const iconButton = (surface: string) => `w-8 h-8 max-sm:w-[32px] max-sm:h-[32px] flex items-center justify-center ${surface} rounded-full text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors`;
/** Circular icon button (w-8 h-8; 32px on phones) */
export const ICON_BTN = iconButton(SURFACE);
/** The same button in the map top bar. */
export const TOP_BAR_ICON_BTN = iconButton(TOP_BAR_SURFACE);

/** Shared transition timing tokens */
export const TRANSITION_FAST = 'duration-150 ease-out';
export const TRANSITION_BASE = 'duration-200 ease-out';
export const TRANSITION_SLOW = 'duration-300 ease-out';

/** Shared panel entrance animations */
export const PANEL_ENTER = `animate-in fade-in slide-in-from-bottom-2 ${TRANSITION_SLOW}`;
export const PANEL_ENTER_LEFT = `animate-in fade-in slide-in-from-left-2 ${TRANSITION_SLOW}`;
export const PANEL_ENTER_TOP = `animate-in fade-in zoom-in-95 slide-in-from-top-1 origin-top-right ${TRANSITION_FAST}`;

/** Right-anchored dropdown card — Settings, Info, etc. */
export const DROPDOWN_PANEL = `absolute top-[4.5rem] left-3 right-3 sm:left-auto sm:right-6 sm:w-[360px] h-[calc(100vh-5.5rem)] flex flex-col ${SURFACE} rounded-2xl overflow-hidden`;

/** Scale + opacity entrance animation for dropdown panels */
export const dropdownAnim = (visible: boolean) =>
  `transition-[opacity,transform] ${TRANSITION_BASE} origin-top-right ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`;

/** Generic floating card (dropdown menus, small overlays) */
export const FLOATING_CARD = `${SURFACE} rounded-2xl`;
/** Every sidebar card's surface. */
export const SIDEBAR_CARD_SURFACE = `${SURFACE} rounded-2xl`;

/** Shared shell for a scrollable sidebar card. */
export const PANEL_SHELL = `${FLOATING_CARD} flex flex-col overflow-hidden`;

const pillSurface = (surface: string) => `h-8 max-sm:h-[32px] flex items-center ${surface} rounded-full`;
/** Pill surface (search bar, headway filter row, History's year slider) */
export const PILL_SURFACE = pillSurface(SURFACE);
/** The same pill in the map top bar (the search bar). */
export const TOP_BAR_PILL_SURFACE = pillSurface(TOP_BAR_SURFACE);
/** Shared responsive width used by the top search bar */
export const SEARCH_BAR_WIDTH = 'w-full sm:w-72 xl:w-80';

/** Width constant for panels and cards; matches the responsive search bar on desktop. */
export const SIDEBAR_PANEL_WIDTH = 'w-[calc(100vw-3rem)] sm:w-72 lg:w-72 xl:w-80 max-w-sm';

/** Shared glass pill geometry; surfaces and borders are supplied by each state. */
export const GLASS_PILL = 'backdrop-blur-md rounded-full';
/** Filter chip pill base — border color added dynamically per active state */
export const CHIP_BASE = `${GLASS_PILL} bg-[var(--bg-panel)] border`;

/** Shared mode-aware control states. */
/** Same selected tint for pills that float over the map: an opaque panel base with the tint laid on top. */
export const CONTROL_ACTIVE_GLASS = 'bg-[var(--bg-panel)] [background-image:linear-gradient(var(--control-active-bg),var(--control-active-bg))] border-[var(--control-active-border)] text-[var(--control-active-fg)]';
export const CONTROL_ACTIVE = 'bg-[var(--control-active-bg)] border-[var(--control-active-border)] text-[var(--control-active-fg)]';
export const CONTROL_INACTIVE = 'bg-[var(--control-inactive-bg)] border-[var(--control-inactive-border)] text-[var(--control-inactive-fg)] hover:bg-[var(--control-hover-bg)]';
/** Compact filter option button used across agency, hidden-route, and feed lists. */
export const FILTER_OPTION = 'px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap';
/** App switchers use the same glass pill surface as the filter chips. */
/** Active view tab: the selected tint plus a firmer ring, so it stands out in both themes without a dark fill. */
export const APP_TAB_ACTIVE = `${GLASS_PILL} ${CONTROL_ACTIVE_GLASS} ring-1 ring-[var(--control-active-border)]`;
const appTabInactive = (outline: string) => `${GLASS_PILL} bg-[var(--bg-panel)] ${outline} text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] hover:text-[var(--accent)]`;
export const APP_TAB_INACTIVE = appTabInactive('border-[var(--border-primary)]');
/** An unselected view tab in the map top bar. */
export const TOP_BAR_TAB_INACTIVE = appTabInactive(TOP_BAR_OUTLINE);
export const SELECTION_ACTIVE = 'bg-[var(--selection-active-bg)] border-l-2 border-[var(--selection-active-border)]';
export const SELECTION_ACTIVE_TEXT = 'text-[var(--selection-active-fg)]';
export const ACTION_PRIMARY = 'bg-[var(--action-primary-bg)] border-[var(--action-primary-border)] text-[var(--action-primary-fg)]';

/** Bottom map HUD badge (routes, coverage, loading, attribution) */
export const MAP_BADGE = 'flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full px-3';
export const MAP_BADGE_COUNT = 'text-xs font-black text-[var(--text-primary)]';
export const MAP_BADGE_LABEL = 'text-xs font-semibold leading-none text-[var(--text-muted)]';

/** Full-width border-b list row — suggestion lists, route lists, any clickable row inside a panel */
export const LIST_ROW = 'flex items-center justify-between w-full px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group';

/** Card-style list row: uses whitespace instead of a browser-like divider. */
export const LIST_ROW_SPACED = 'flex items-center justify-between w-full px-4 py-2.5 mb-0.5 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group';

/** Primary text inside a LIST_ROW */
export const LIST_ROW_PRIMARY = 'text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight';

/** Dim sub-label inside a LIST_ROW */
export const LIST_ROW_DIM = 'text-xs text-[var(--text-muted)] font-bold';

/** Shared agency-browser row used by Info and History agency lists. */
export const AGENCY_LIST_ROW = 'w-full flex items-center justify-between px-5 py-2 hover:bg-[var(--bg-btn-hover)] transition-colors text-left';
export const AGENCY_LIST_PRIMARY = 'text-xs text-[var(--text-primary)] min-w-0 line-clamp-2 break-words';

/** Floating panel title bar — Near You, Live Vehicles list, etc. */
export const PANEL_TITLE_BAR = 'flex items-center gap-1.5 px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0';

/** Title text inside PANEL_TITLE_BAR */
export const PANEL_TITLE = 'text-xs font-black text-[var(--text-dim)]';

/** Compact explanatory line beneath a research panel title. */
export const PANEL_HELPER = 'px-4 pt-2 pb-2 text-xs text-[var(--text-dim)] font-bold leading-snug border-b border-[var(--border-primary)]';

/** Back + card title row inside a floating panel */
export const PANEL_CARD_HEADER = 'flex items-start gap-2 px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0';

/** Section label inside a floating panel list */
/** Region heading in an agency list (About panel's agency list, History's agency chooser). */
export const LIST_REGION_HEAD = 'px-5 pt-3 pb-1 text-xs font-bold text-[var(--text-dim)]';

/** The filter block above an agency list (search and pills), with one divider under it. */
export const AGENCY_LIST_FILTERS = 'shrink-0 px-4 pt-3 pb-2 bg-[var(--bg-panel)] border-b border-[var(--border-primary)] space-y-2';

/** A row of filter pills that scrolls sideways instead of wrapping. */
export const PILL_SCROLL_ROW = 'flex gap-1.5 overflow-x-auto items-center [&::-webkit-scrollbar]:hidden';

export const PANEL_SECTION_HEAD = 'px-4 py-2 text-xs font-black text-[var(--text-dim)]';

/** Accent group label in search results */
export const PANEL_SEARCH_HEAD = 'px-4 text-xs font-bold text-[var(--accent)] mb-1.5';

/** Sub-section label (In this area / Elsewhere) */
export const PANEL_SEARCH_SUBHEAD = 'px-4 pt-2 pb-0.5 text-xs font-bold text-[var(--text-dim)]';

/** Scrollable body inside a floating panel */
export const PANEL_BODY = 'flex-1 overflow-y-auto custom-scrollbar min-h-0';

/** Empty / loading copy inside a panel row */
export const PANEL_EMPTY = 'px-4 py-3 text-xs text-[var(--text-muted)] font-bold';

/**
 * Inline notice / warning (outdated schedule, corrected data, outside filters).
 * Use via CardHelpNotice — these tokens keep one visual language.
 */
export const CARD_NOTICE = 'text-xs font-normal text-[var(--text-dim)]';
/** A short grey note inside a card (the route card's pattern label and "No midday service."; the chart's period
 *  name and legend). Bold, to read beside the card's bold rows. */
export const CARD_NOTE = 'text-xs font-bold text-[var(--text-dim)]';
/** A small section label ("Westbound", "On-demand service", the filter panel's "Mode"). */
export const CARD_SECTION = 'text-xs font-black text-[var(--text-dim)]';
/** The chart's period names over its bars (route card chart and the full-day view). */
export const CHART_PERIOD_LABEL = 'text-xs font-black text-[var(--text-muted)]';
/** A heading inside the chart area (the trip-time strip's "Trip time"). */
export const CHART_HEADING = 'text-xs font-bold text-[var(--text-muted)]';
/** The gap under a small heading before its content (a list's section head, a chart's title). */
export const HEADING_GAP = 'mb-1';
/** Footer block under card content (spacing only, no divider) */
export const CARD_NOTICE_FOOTER = 'mt-2 pt-1';
/** In-list notice padding (e.g. outside-filters control) */
export const CARD_NOTICE_INLINE = 'px-4 pt-2 pb-1 opacity-80';

/**
 * Pill search box wrapper inside panels and dropdowns. Same look as the top search bar (surface,
 * edge, height, roundness, icon and text), so every search field matches.
 */
export const SEARCH_PILL = 'flex items-center h-8 bg-[var(--bg-panel)] border border-[var(--border-primary)] rounded-full pl-2 pr-3 gap-2.5';

/** The magnifier in every search field, the top search bar included. */
export const SEARCH_ICON = 'w-3.5 h-3.5 text-[var(--text-dim)] shrink-0';

/** Search input text field (inside SEARCH_PILL) */
export const SEARCH_FIELD = 'flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none';

// Z-index stack — use these everywhere instead of inline z-[NNN] magic numbers
export const Z_MAP_OVERLAY = 'z-[500]';   // App-level opacity wrappers (Corridors, Live mounts)
export const Z_PANEL     = 'z-[1000]';    // Sidebars, panels, map overlays
export const Z_HEADER    = 'z-[1100]';    // Header row, in-app right-side button bars
export const Z_DROPDOWN  = 'z-[1200]';    // Autocomplete dropdowns, app drawer panel
export const Z_MODAL_BG  = 'z-[1400]';    // InfoPanel backdrop
export const Z_MODAL_TOP = 'z-[1500]';    // FilterPanel backdrop (above InfoPanel)
export const Z_PANEL_RAISED = 'z-[1001]'; // One step above the panels: Compare's map labels and link button, so a chip's menu opens over the phone route sheet

/** The top of everything that sits under the search bar: 7px below it (the bar ends at 49px on desktop, 51px on phones).
 *  The desktop step is its own token for a phone layout that starts somewhere else (Compare's lower map). */
// Map overlay slots: one layout table for every fixed overlay over the map (CIV-1136), kept in mapOverlayLayout.ts.
export {
  MAP_TOP_BAR_SLOT, MAP_FOOTER_ROW_SLOT, MAP_FOOTER_PILLS_PHONE_SLOT, MAP_COUNTS_PHONE_SLOT, MAP_LEGEND_SLOT, MAP_CONTROLS_SLOT,
  MAP_NOTICE_SLOT, MAP_NOTICE_SLOT_RAISED, MAP_FOOTER_HEIGHT_FALLBACK, mapFooterStyle, MAP_CONSENT_SLOT, MAP_STATUS_SLOT,
} from './mapOverlayLayout';

export const SIDEBAR_CARD_TOP_DESKTOP = 'sm:top-[56px]';
export const SIDEBAR_CARD_TOP = `top-[58px] ${SIDEBAR_CARD_TOP_DESKTOP}`;
/** Every sidebar card's placement: SIDEBAR_CARD_TOP plus its left edge. */
export const SIDEBAR_CARD_SLOT = `absolute ${SIDEBAR_CARD_TOP} left-6 sm:left-[var(--sidebar-left)]`;
export const SIDEBAR_CARD = `${SIDEBAR_CARD_SLOT} ${Z_PANEL}`;
/** Every sidebar card's tallest size: it stops 7px above the bottom pills (measured: their top is 49px up
 *  on desktop, 53px on phones) and its list scrolls inside. */
export const SIDEBAR_CARD_MAX_H = 'max-h-[calc(100vh-112px)] max-sm:max-h-[calc(100dvh-118px)]';


/** Live's sidebar placement, kept apart from the cards' while Live is rebuilt on its own branch
 *  (Live sidebars never scroll or collapse). */
export const PANEL_SIDEBAR_SLOT = 'absolute top-[68px] left-6 sm:left-[var(--sidebar-left)]';
export const PANEL_SIDEBAR = `${PANEL_SIDEBAR_SLOT} ${Z_PANEL}`;

/** Fallback sidebar left offset (px) — used until ResizeObserver measures the real position */
export const SIDEBAR_LEFT_FALLBACK = 182;

/**
 * Inline placement every sidebar card shares: its left edge (--sidebar-left, the fallback until the
 * real position is measured) and, on desktop, the search bar's width. Callers pass no width on phones.
 */
export function sidebarFrameStyle(sidebarLeft?: number | null, searchBarWidth?: number): CSSProperties {
  return {
    '--sidebar-left': `${sidebarLeft ?? SIDEBAR_LEFT_FALLBACK}px`,
    ...(searchBarWidth ? { width: `${searchBarWidth}px`, maxWidth: 'none' } : {}),
  } as CSSProperties;
}
