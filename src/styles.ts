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
export const DROPDOWN_PANEL = `absolute top-[4.5rem] right-6 w-[360px] max-h-[calc(100vh-5.5rem)] flex flex-col ${SURFACE} rounded-2xl shadow-2xl overflow-hidden`;

/** Scale + opacity entrance animation for dropdown panels */
export const dropdownAnim = (visible: boolean) =>
  `transition-[opacity,transform] ${TRANSITION_BASE} origin-top-right ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`;

/** Generic floating card (dropdown menus, small overlays) */
export const FLOATING_CARD = `${SURFACE} rounded-2xl shadow-2xl`;

/** Top-bar pill surface (search bar, headway filter row) */
export const PILL_SURFACE = `h-8 flex items-center ${SURFACE} rounded-full shadow-lg`;

/** Filter chip pill base — border color added dynamically per active state */
export const CHIP_BASE = 'bg-[var(--bg-panel)] backdrop-blur-md border rounded-full shadow-lg';
