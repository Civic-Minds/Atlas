/**
 * Shared structural class constants for Atlas UI primitives.
 * Color tokens live in CSS variables (index.css). These handle shape, shadow, and surface.
 */

/** Glass panel surface: background + blur + primary border */
export const SURFACE = 'bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)]';

/** Circular icon button (w-8 h-8, top-bar style) */
export const ICON_BTN = `w-8 h-8 flex items-center justify-center ${SURFACE} rounded-full shadow-lg text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors`;

/** Shared transition timing tokens */
export const TRANSITION_FAST = 'duration-150 ease-out';
export const TRANSITION_BASE = 'duration-200 ease-out';
export const TRANSITION_SLOW = 'duration-300 ease-out';

/** Shared panel entrance animations */
export const PANEL_ENTER = `animate-in fade-in slide-in-from-bottom-2 ${TRANSITION_SLOW}`;
export const PANEL_ENTER_LEFT = `animate-in fade-in slide-in-from-left-2 ${TRANSITION_SLOW}`;
export const PANEL_ENTER_TOP = `animate-in fade-in zoom-in-95 slide-in-from-top-1 origin-top-right ${TRANSITION_FAST}`;

/** Right-anchored dropdown card — Settings, Info, etc. */
export const DROPDOWN_PANEL = `absolute top-[4.5rem] right-6 w-[360px] h-[calc(100vh-5.5rem)] flex flex-col ${SURFACE} rounded-2xl shadow-2xl overflow-hidden`;

/** Scale + opacity entrance animation for dropdown panels */
export const dropdownAnim = (visible: boolean) =>
  `transition-[opacity,transform] ${TRANSITION_BASE} origin-top-right ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`;

/** Generic floating card (dropdown menus, small overlays) */
export const FLOATING_CARD = `${SURFACE} rounded-2xl shadow-2xl`;

/** Shared shell for a scrollable sidebar card. */
export const PANEL_SHELL = `${FLOATING_CARD} flex flex-col overflow-hidden`;

/** Top-bar pill surface (search bar, headway filter row) */
export const PILL_SURFACE = `h-8 flex items-center ${SURFACE} rounded-full shadow-lg`;
/** Shared responsive width used by the top search bar */
export const SEARCH_BAR_WIDTH = 'w-full sm:w-56 xl:w-72';

/** Width constant for panels and cards, matching search bar on desktop but wider on mobile */
export const SIDEBAR_PANEL_WIDTH = 'w-[calc(100vw-3rem)] sm:w-44 lg:w-56 xl:w-72 max-w-sm';

/** Filter chip pill base — border color added dynamically per active state */
export const CHIP_BASE = 'bg-[var(--bg-panel)] backdrop-blur-md border rounded-full shadow-lg';

/** Bottom map HUD badge (routes, coverage, loading, attribution) */
export const MAP_BADGE = 'flex items-center gap-1.5 bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3';
export const MAP_BADGE_COUNT = 'text-xs font-black text-[var(--text-primary)]';
export const MAP_BADGE_LABEL = 'text-[10px] font-bold text-[var(--text-muted)]';

/** Full-width border-b list row — suggestion lists, route lists, any clickable row inside a panel */
export const LIST_ROW = 'flex items-center justify-between w-full px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group';

/** Card-style list row: uses whitespace instead of a browser-like divider. */
export const LIST_ROW_SPACED = 'flex items-center justify-between w-full px-4 py-2.5 mb-0.5 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group';

/** Primary text inside a LIST_ROW */
export const LIST_ROW_PRIMARY = 'text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight';

/** Dim sub-label inside a LIST_ROW */
export const LIST_ROW_DIM = 'text-[10px] text-[var(--text-muted)] font-bold';

/** Floating panel title bar — Near You, Live Vehicles list, etc. */
export const PANEL_TITLE_BAR = 'flex items-center gap-1.5 px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0';

/** Title text inside PANEL_TITLE_BAR */
export const PANEL_TITLE = 'text-[10px] font-black text-[var(--text-dim)] tracking-wide';

/** Back + card title row inside a floating panel */
export const PANEL_CARD_HEADER = 'flex items-start gap-2 px-4 pt-3 pb-2.5 border-b border-[var(--border-primary)] shrink-0';

/** Section label inside a floating panel list */
export const PANEL_SECTION_HEAD = 'px-4 py-2 text-[10px] font-black tracking-wide text-[var(--text-dim)]';

/** Accent group label in search results */
export const PANEL_SEARCH_HEAD = 'px-4 text-[10px] font-bold text-[var(--accent)] tracking-wide mb-1.5';

/** Sub-section label (In this area / Elsewhere) */
export const PANEL_SEARCH_SUBHEAD = 'px-4 pt-2 pb-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--text-dim)]';

/** Scrollable body inside a floating panel */
export const PANEL_BODY = 'flex-1 overflow-y-auto custom-scrollbar min-h-0';

/** Empty / loading copy inside a panel row */
export const PANEL_EMPTY = 'px-4 py-3 text-[11px] text-[var(--text-muted)] font-bold';

/**
 * Inline notice / warning (outdated schedule, corrected data, outside filters).
 * Use via CardHelpNotice — these tokens keep one visual language.
 */
export const CARD_NOTICE = 'text-[9px] font-bold text-[var(--text-dim)]';
export const CARD_NOTICE_ACTION =
  'text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors font-bold cursor-pointer';
/** Footer block under card content (border-t + dim) */
export const CARD_NOTICE_FOOTER = 'mt-2 border-t border-[var(--border-primary)] pt-2 opacity-80';
/** In-list notice padding (e.g. outside-filters control) */
export const CARD_NOTICE_INLINE = 'px-4 pt-2 pb-1 opacity-80';

/** Pill search box wrapper — used inside panels (recessed bg-app background) */
export const SEARCH_PILL = 'flex items-center h-8 bg-[var(--bg-app)] border border-[var(--border-primary)] rounded-full px-3 gap-1.5';

/** Search input text field (inside SEARCH_PILL) */
export const SEARCH_FIELD = 'flex-1 bg-transparent text-xs font-bold text-[var(--text-primary)] placeholder:text-[var(--text-dim)] focus:outline-none';

// Z-index stack — use these everywhere instead of inline z-[NNN] magic numbers
export const Z_MAP_OVERLAY = 'z-[500]';   // App-level opacity wrappers (Corridors, Live mounts)
export const Z_PANEL     = 'z-[1000]';    // Sidebars, panels, map overlays
export const Z_HEADER    = 'z-[1100]';    // Header row, in-app right-side button bars
export const Z_DROPDOWN  = 'z-[1200]';    // Autocomplete dropdowns, app drawer panel
export const Z_MODAL_BG  = 'z-[1400]';    // InfoPanel backdrop
export const Z_MODAL_TOP = 'z-[1500]';    // FilterPanel backdrop (above InfoPanel)
export const PANEL_Z_INDEX = 1000;         // Numeric for inline styles (e.g. NearbyRoutesPanel)

/** Shared sidebar placement below the top search controls. */
export const PANEL_SIDEBAR = `absolute top-[68px] left-6 sm:left-[var(--sidebar-left)] ${Z_PANEL}`;

/** Fallback sidebar left offset (px) — used until ResizeObserver measures the real position */
export const SIDEBAR_LEFT_FALLBACK = 182;
