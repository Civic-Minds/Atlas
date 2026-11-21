/**
 * Every colour Atlas sets in code, in one place (rules audit 4.1, move 8): the frequency tier palettes (one colour per
 * PUBLIC_TIER_MAXES step, then Infrequent), vehicle status colours, the night and branch palettes, the shared
 * fallback grey and the map's halo and line colours. CSS tokens stay in src/styles/index.css. Imports nothing, so any
 * bundle, the pipeline and the scripts can read it.
 */

/** The frequency tiers' colours, best first: every 10, 15, 20, 30 and 60 min, then Infrequent. */
export const TIER_COLOURS = ['#22863a', '#3da44d', '#f59e0b', '#e07b2a', '#92400e', '#6b7280'] as const;
/**
 * The same tiers for colour-vision-friendly mode: a high-contrast palette based on Okabe-Ito's colour-universal design
 * work. Frequency order is carried by the legend and line weight as well as colour; the palette is not the only cue.
 */
export const COLOR_VISION_TIER_COLOURS = ['#0072b2', '#009e73', '#56b4e9', '#e69f00', '#cc79a7', '#4d4d4d'] as const;

/** The plain page colour (src/styles/index.css --bg-app, light theme; a test keeps them equal): the background of a drawn link-preview image (CIV-1393). */
export const PAGE_BACKGROUND = '#f0f0f0';
/** The warm paper behind the frequent-service story's pile of printed maps (CIV-1875). */
export const MAP_PILE_PAPER = '#e9e6df';

/** A colour for a value no palette covers (an unknown tier, a missing CSS variable). */
export const FALLBACK_GREY = '#9ca3af';

export interface StatusColor {
  bg: string;
  border: string;
  text: string;
}
type VehicleStatus = 'early' | 'late' | 'on_time' | 'no_data';

/** Live's late red: the --strip-delay-2 token's light value (src/styles/index.css), for the map's vehicle dots. */
export const LATE_RED = '#dc2626';

/** A vehicle's on-time status colours. */
export const STATUS_COLORS: Record<VehicleStatus, StatusColor> = {
  early: { bg: '#3182ce', border: '#2b6cb0', text: '#2b6cb0' },
  // CIV-1812: late is the Live strip's late red (--strip-delay-2, docs/style/VISUAL.md Live), one red for late on every Live view.
  late: { bg: LATE_RED, border: '#9b2c2c', text: '#9b2c2c' },
  on_time: { bg: '#38a169', border: '#276749', text: '#276749' },
  no_data: { bg: '#718096', border: '#4a5568', text: '#718096' },
};
export const COLOR_VISION_STATUS_COLORS: Record<VehicleStatus, StatusColor> = {
  early: { bg: '#0072b2', border: '#005a8d', text: '#005a8d' },
  late: { bg: '#c44516', border: '#9e3510', text: '#9e3510' },
  on_time: { bg: '#009e73', border: '#007a59', text: '#007a59' },
  no_data: { bg: '#6b7280', border: '#4b5563', text: '#4b5563' },
};

/**
 * Branch colours for the route card's stacked hourly chart. The chart stacks every branch
 * of a direction (no cap); 8 covers the most branches any one direction has in the data,
 * so no two legend entries share a colour. Hues avoid the headway-tier greens, oranges,
 * brown and grey.
 */
export const BRANCH_STACK_COLORS = [
  '#2563eb', // blue
  '#db2777', // pink
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#65a30d', // lime
] as const;

export const NIGHT_SERVICE_COLOR = '#818cf8';
export const COLOR_VISION_NIGHT_SERVICE_COLOR = '#0072b2';
/**
 * CIV-1329 (Ryan, 2026-11-03): Night Service in three shades of the night colour, darker = more frequent. 60 keeps
 * the night colour; 30 is darker and 90 lighter. Keyed by night grade (NIGHT_GRADES).
 */
export const NIGHT_SERVICE_TIER_COLORS = {
  default: { 30: '#4f46e5', 60: NIGHT_SERVICE_COLOR, 90: '#c7d2fe' },
  friendly: { 30: '#004a75', 60: COLOR_VISION_NIGHT_SERVICE_COLOR, 90: '#56b4e9' },
} as const;

/** Text on a coloured fill: white, or near-black where white reads worse. */
export const TEXT_ON_DARK = '#ffffff';
export const TEXT_ON_LIGHT = '#111827';
/** The ring round a map dot, light and dark map. */
export const MAP_HALO = { light: '#ffffff', dark: '#111827' } as const;

/** The Live map's grey context lines (CIV-326) and the Live report maps' (CIV-1405). */
export const CONTEXT_LINE_COLOUR = '#6b7280';
/** On-demand zones' fill and outline. */
export const ON_DEMAND_AREA_COLOR = '#64748b';
/** A route layer's line colour before its frequency paint is set. */
export const ROUTE_LINE_PLACEHOLDER = '#555555';
