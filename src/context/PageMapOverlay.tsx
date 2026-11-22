import React, { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { MapMeasure, RouteMapModel } from '../components/Live/routeMapModel';
import type { HeatPoint } from '../components/Live/delayHeatModel';

/**
 * A page drawn on the shared map (CIV-1828), as History draws through HistoryMapOverlay: Studio's pages hand the map
 * what to draw, and the main map (MapCanvas) draws it with PageMapLayer. While a page overlay is set, the main map's
 * own clicks are off. The same drawing serves the Live tool page's own map (MapAppMap) until it moves onto this one.
 */

export type MapPick =
  | { kind: 'segment'; fromStopId: string; toStopId: string; route?: string }
  | { kind: 'stop'; stopId: string }
  /** A static route line (a `lines` layer), by its id. */
  | { kind: 'line'; id: string; route?: string };

/** A route drawn as one plain line: Studio's before and after shapes, and changed, added and removed routes. */
export interface MapLine {
  id: string;
  coordinates: [number, number][];
  /** Any CSS colour; a `var(--…)` token is read from the page. */
  color: string;
  /** Drawn dashed (a removed route, a before shape). */
  dashed?: boolean;
  /** 0 to 1 (default 1). */
  opacity?: number;
  /** The hover text. */
  label?: string;
  route?: string;
}

/**
 * What the map draws. `segments`: Live's stop-to-stop segments and stop dots, coloured by a measure (with Delay starts'
 * heat). `lines`: plain route lines, each in its own colour and style.
 */
export type MapLayer =
  | { kind: 'segments'; model: RouteMapModel; measure: MapMeasure; heat?: HeatPoint[] | null }
  | { kind: 'lines'; lines: readonly MapLine[] };

export interface PageMapOverlay {
  layer: MapLayer;
  /** The picked segment, stop or line: drawn marked. */
  selected: MapPick | null;
  /** A click on a segment, stop or line, with where it landed; a click on empty map gives null. */
  onPick: (pick: MapPick | null, at: [number, number] | null) => void;
  /** Where the card is anchored (longitude, latitude), and what it shows. The card follows the map as it moves. */
  anchor?: [number, number] | null;
  card?: ReactNode;
  /** Moves the map to this point (a row picked in a table); a new `k` moves it again. */
  centerOn?: { lonLat: [number, number]; k: number } | null;
  /** On a map of several routes: the route to show strongly while the others fade. */
  highlightRoute?: string | null;
  /** Changes when what is framed changes (agency, route, direction): the map then frames what it draws. */
  frameKey: string;
  /** Pixels at each edge the map keeps clear when framing; left out, the main map's own route framing. */
  padding?: { top: number; bottom: number; left: number; right: number };
  /** The page's sidebar card: the main map's route framing keeps clear of where it really is (routeFramePadding). */
  frameCard?: React.RefObject<HTMLElement | null>;
  /** The key last framed, kept by whoever owns the map's position (the Studio frame): a page swapped in with the same
   *  key keeps the map where it is, instead of framing again. Left out, the layer keeps its own, reset when it closes. */
  framedMemory?: React.MutableRefObject<string | null>;
  /** Don't frame yet: what's drawn is still loading, so framing it now would frame part of it. */
  holdFrame?: boolean;
  /** A pill for the map's loading-pill spot (the counts row): it shows once the map has finished loading, never beside the
   *  loading pill (Studio's "Data up to" date). */
  statusPill?: ReactNode;
}

interface ContextValue {
  overlay: PageMapOverlay | null;
  setOverlay: (overlay: PageMapOverlay | null) => void;
}

const PageMapOverlayContext = createContext<ContextValue | null>(null);

export function PageMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<PageMapOverlay | null>(null);
  const setOverlay = useCallback((o: PageMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return <PageMapOverlayContext.Provider value={value}>{children}</PageMapOverlayContext.Provider>;
}

export function usePageMapOverlay() {
  const ctx = useContext(PageMapOverlayContext);
  if (!ctx) throw new Error('usePageMapOverlay must be used within PageMapOverlayProvider');
  return ctx;
}
