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

/** Top-bar pill surface (search bar, headway filter row) */
export const PILL_SURFACE = `h-8 flex items-center ${SURFACE} rounded-full shadow-lg`;

/** Filter chip pill base — border color added dynamically per active state */
export const CHIP_BASE = 'bg-[var(--bg-panel)] backdrop-blur-md border rounded-full shadow-lg';

/** Full-width border-b list row — suggestion lists, route lists, any clickable row inside a panel */
export const LIST_ROW = 'flex items-center justify-between w-full px-4 py-2.5 border-b border-[var(--border-primary)] last:border-0 hover:bg-[var(--bg-btn-hover)] transition-colors text-left group';

/** Primary text inside a LIST_ROW */
export const LIST_ROW_PRIMARY = 'text-xs font-black text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors leading-tight';

/** Dim sub-label inside a LIST_ROW */
export const LIST_ROW_DIM = 'text-[10px] text-[var(--text-muted)] font-bold';

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

/** Fallback sidebar left offset (px) — used until ResizeObserver measures the real position */
export const SIDEBAR_LEFT_FALLBACK = 182;
