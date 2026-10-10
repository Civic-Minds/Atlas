import type { Agency } from '../App';
import type { DayType } from '../../shared/dayTypes';
import type { TimePeriod } from '../hooks/useIntervalStats';
import { PERIOD_LABELS } from '../hooks/useIntervalStats';
import { FILTER_MODES } from '../../shared/modes';
import type { FrequentServiceFrequency, FrequentServiceWindow } from '../../shared/frequentService';
import type { NightServiceFrequency } from '../../shared/nightService';
import { agencyDisplayParts } from './format';
import { getFareTiers, getHeadwayTiers, getNightServiceColor, getTierColor, headwayThresholdForZoom, type ColorVisionMode } from './colors';

/** One entry in the exported image's colour key. */
export interface MapExportKeyItem {
  color: string;
  label: string;
}

/** Everything the exported image says about the view, all derived from the map's own state. */
export interface MapExportDetails {
  /** Place name, only when one city clearly fills the view (e.g. "Toronto"); otherwise null. */
  place: string | null;
  /** Large heading: the place when known, otherwise the view name. */
  title: string;
  /** Plain-language description lines, e.g. ["Transit frequency", "Route 504 King", "Every 20 min or better · Saturday midday"]. */
  lines: string[];
  key: MapExportKeyItem[];
  /** Small heading above the key, matching the app's legend. */
  keyTitle?: string;
  /** Lowercase file name without special characters, e.g. "atlas-toronto-20min-saturday-midday.png". */
  filename: string;
}

/** Part of the map in CSS pixels ([[left, top], [right, bottom]]) that the image shows. */
export type MapExportBox = [[number, number], [number, number]];

export type MapExportView = 'frequency' | 'frequent-service' | 'night' | 'fares' | 'other';

export interface MapExportState {
  view: MapExportView;
  /** View name as the app shows it, e.g. "Transit Frequency". */
  viewTitle: string;
  colorMode: ColorVisionMode;
  maxHeadway: number;
  day: DayType;
  period: TimePeriod;
  zoom: number;
  selectedModes?: Iterable<number>;
  query?: string;
  /** Display label of the selected route, only when it is drawn in the view. */
  routeLabel?: string | null;
  routeShortName?: string | null;
  nightServiceFrequency?: NightServiceFrequency;
  frequentServiceDays?: DayType[];
  frequentServiceFrequency?: FrequentServiceFrequency;
  frequentServiceWindow?: FrequentServiceWindow;
}

export interface RenderedRouteSample {
  agencySlug: string | null | undefined;
  /** Unique id of the route, used to weight agencies by how many routes they draw. */
  routeKey: string;
  /** Line colour as drawn, in any CSS hex form. */
  color: string | null;
}

/** "Transit Frequency" -> "Transit frequency". Keeps text sentence case, never all caps. */
export function sentenceCase(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.map((word, index) => {
    if (index === 0) return word;
    // Keep acronyms (e.g. "GO") and mixed-case brands as written.
    return /[A-Z].*[A-Z]/.test(word) ? word : word.toLowerCase();
  }).join(' ');
}

/** Same wording as the frequency chip's options. */
export function describeHeadwayFilter(maxHeadway: number): string {
  return Number.isFinite(maxHeadway) ? `Every ${maxHeadway} min or better` : 'All routes';
}

function periodPhrase(period: TimePeriod): string {
  // "AM Peak" -> "AM peak", "Midday" -> "midday", "All day" -> "all day".
  return PERIOD_LABELS[period]
    .split(' ')
    .map(word => (/^[AP]M$/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

/** "Saturday midday", "Weekday AM peak", "Sunday, all day". */
export function describeDayAndPeriod(day: DayType, period: TimePeriod): string {
  return period === 'all' ? `${day}, all day` : `${day} ${periodPhrase(period)}`;
}

const FREQUENT_WINDOW_LABELS: Record<FrequentServiceWindow, string> = {
  daytime: '7am–7pm',
  extended: '7am–midnight',
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The highest headway tier the map draws at this zoom (the app hides less frequent routes when zoomed out). */
function zoomCeiling(zoom: number): number {
  const ceiling = headwayThresholdForZoom(zoom);
  return ceiling >= 9999 ? Infinity : ceiling;
}

function filterLine(state: MapExportState): string | null {
  switch (state.view) {
    case 'frequency': {
      const parts = [describeHeadwayFilter(state.maxHeadway), describeDayAndPeriod(state.day, state.period)];
      const modes = [...(state.selectedModes ?? [])];
      if (modes.length > 0) {
        const labels = FILTER_MODES.filter(mode => modes.includes(mode.id)).map(mode => mode.label);
        if (labels.length > 0) parts.push(joinList(labels));
      }
      return parts.join(' · ');
    }
    case 'frequent-service': {
      const days = state.frequentServiceDays?.length ? joinList(state.frequentServiceDays) : null;
      const window = state.frequentServiceWindow ? FREQUENT_WINDOW_LABELS[state.frequentServiceWindow] : null;
      return [
        state.frequentServiceFrequency ? `Every ${state.frequentServiceFrequency} min or better` : null,
        days,
        window,
      ].filter(Boolean).join(' · ') || null;
    }
    case 'night':
      return state.nightServiceFrequency ? `Night service every ${state.nightServiceFrequency} min or better` : null;
    default:
      return null;
  }
}

/** Key candidates for the current view and colour mode, in display order. */
export function keyCandidates(state: Pick<MapExportState, 'view' | 'colorMode' | 'frequentServiceFrequency'>): MapExportKeyItem[] {
  switch (state.view) {
    case 'frequency':
      return getHeadwayTiers(state.colorMode).map(tier => ({ color: tier.color, label: tier.label }));
    case 'frequent-service':
      return state.frequentServiceFrequency === 15
        ? [{ color: getTierColor('15', state.colorMode), label: '≤15 min' }]
        : [
          { color: getTierColor('15', state.colorMode), label: '≤15 min' },
          { color: getTierColor('30', state.colorMode), label: '16–30 min' },
        ];
    case 'night':
      return [{ color: getNightServiceColor(state.colorMode), label: 'Night service' }];
    case 'fares':
      return getFareTiers(state.colorMode).map(tier => ({ color: tier.color, label: tier.label }));
    default:
      return [];
  }
}

function normalizeHex(color: string): string {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  return value;
}

/** Only key entries whose colour is actually drawn on the map, in the app's own order. */
export function buildExportKey(candidates: MapExportKeyItem[], drawnColors: Iterable<string>): MapExportKeyItem[] {
  const drawn = new Set([...drawnColors].map(normalizeHex));
  const seen = new Set<string>();
  return candidates.filter(item => {
    const color = normalizeHex(item.color);
    if (!drawn.has(color) || seen.has(color)) return false;
    seen.add(color);
    return true;
  });
}

function agencyPlace(agency: Agency | undefined): string | null {
  if (!agency) return null;
  if (agency.displayArea) return agency.displayArea;
  // A place written in the agency's own name ("STM (Montréal)", "OC Transpo (Ottawa)") is the
  // most reliable label; the stop-density city can be a neighbourhood in large cities.
  const fromName = agencyDisplayParts(agency.name).secondary;
  if (fromName) return fromName;
  const city = agency.cities?.[0]?.split(',')[0]?.trim();
  return city || null;
}

/** Share of the drawn routes one place must have before the image is named after it. */
export const PLACE_DOMINANCE_SHARE = 0.7;

/**
 * Name the view only when one place clearly fills it: that place's agencies must draw at least
 * PLACE_DOMINANCE_SHARE of the routes in view. Otherwise return null and show no name, so the
 * image never names a place that could misdescribe the map.
 */
export function pickExportPlace(samples: RenderedRouteSample[], agencies: Agency[]): string | null {
  const routesBySlug = new Map<string, Set<string>>();
  for (const sample of samples) {
    if (!sample.agencySlug) continue;
    const routes = routesBySlug.get(sample.agencySlug) ?? new Set<string>();
    routes.add(sample.routeKey);
    routesBySlug.set(sample.agencySlug, routes);
  }
  if (routesBySlug.size === 0) return null;

  const bySlug = new Map(agencies.map(agency => [agency.slug, agency]));
  const placeCounts = new Map<string, number>();
  let total = 0;
  for (const [slug, routes] of routesBySlug) {
    // Routes from an agency with no known place still count toward the total, so they can
    // stop another place from looking dominant, but never name the view themselves.
    const place = agencyPlace(bySlug.get(slug));
    if (place) placeCounts.set(place, (placeCounts.get(place) ?? 0) + routes.size);
    total += routes.size;
  }
  const [top] = [...placeCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return top && top[1] / total >= PLACE_DOMINANCE_SHARE ? top[0] : null;
}

export function slugifyForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/≤/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function filenameParts(state: MapExportState, place: string | null): string[] {
  const parts = place ? ['atlas', place] : ['atlas'];
  switch (state.view) {
    case 'frequency':
      if (state.routeShortName) parts.push(`route ${state.routeShortName}`);
      parts.push(Number.isFinite(state.maxHeadway) ? `${state.maxHeadway}min` : 'all routes');
      parts.push(state.day, state.period === 'all' ? 'all day' : PERIOD_LABELS[state.period]);
      break;
    case 'frequent-service':
      parts.push('frequent service');
      if (state.frequentServiceFrequency) parts.push(`${state.frequentServiceFrequency}min`);
      if (state.frequentServiceDays?.length) parts.push(...state.frequentServiceDays);
      if (state.frequentServiceWindow) parts.push(state.frequentServiceWindow);
      break;
    case 'night':
      parts.push('night service');
      if (state.nightServiceFrequency) parts.push(`${state.nightServiceFrequency}min`);
      break;
    default:
      parts.push(state.viewTitle);
  }
  return parts;
}

export function buildExportFilename(state: MapExportState, place: string | null): string {
  const slug = filenameParts(state, place).map(slugifyForFilename).filter(Boolean).join('-');
  return `${slug || 'atlas-map'}.png`;
}

/** Describe the exported view: place, filter in plain words, colour key and file name. */
export function describeMapExport(state: MapExportState, samples: RenderedRouteSample[], agencies: Agency[]): MapExportDetails {
  const place = pickExportPlace(samples, agencies);
  const drawnColors = samples.map(sample => sample.color).filter((color): color is string => !!color);
  const key = buildExportKey(keyCandidates(state), drawnColors);

  const viewName = sentenceCase(state.viewTitle || 'Transit map');
  // With no clear place, the view name becomes the heading instead of a guessed place.
  const lines = place ? [viewName] : [];
  if (state.view === 'frequency' && state.routeLabel) lines.push(`Route ${state.routeLabel}`);
  const filter = filterLine(state);
  if (filter) lines.push(filter);
  if (state.view === 'frequency') {
    if (zoomCeiling(state.zoom) < state.maxHeadway) lines.push('Zoomed out, so some less frequent routes are hidden');
    if (state.query?.trim()) lines.push(`Matching “${state.query.trim()}”`);
  }

  const keyTitle = state.view === 'fares' ? 'Base fare' : state.view === 'night' ? undefined : 'Frequency';
  return { place, title: place ?? viewName, lines, key, keyTitle, filename: buildExportFilename(state, place) };
}
