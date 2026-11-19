import type { DayType } from '../../shared/dayTypes';
import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { HistoryYearRoute } from '../utils/historyYearMap';

export interface HistoryMapOverlay {
  slug: string;
  /** CIV-1963: a parent agency's feeds, whose lines on today's map are the open agency's (default: [slug]). */
  slugs?: string[];
  routeShortName: string;
  agencyCenter?: [number, number];
  routeGeometry?: number[][];  // historical shape for the selected period (AI-162, AI-161)
  selectedYear?: number;
  /** The selected year's routes (#1028 batch A): drawn on their own shape when they have one, else on today's map line. */
  yearRoutes?: HistoryYearRoute[];
  /** History's day: routes on today's map lines draw that day's line only, as the map does. */
  day?: DayType;
}

/** The feeds whose lines are the open History agency's: a parent's members, or the agency itself. */
export function historyOverlaySlugs(o: Pick<HistoryMapOverlay, 'slug' | 'slugs'>): string[] {
  return o.slugs ?? [o.slug];
}

interface ContextValue {
  overlay: HistoryMapOverlay | null;
  setOverlay: (overlay: HistoryMapOverlay | null) => void;
}

const HistoryMapOverlayContext = createContext<ContextValue | null>(null);

export function HistoryMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<HistoryMapOverlay | null>(null);
  const setOverlay = useCallback((o: HistoryMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return (
    <HistoryMapOverlayContext.Provider value={value}>
      {children}
    </HistoryMapOverlayContext.Provider>
  );
}

export function useHistoryMapOverlay() {
  const ctx = useContext(HistoryMapOverlayContext);
  if (!ctx) throw new Error('useHistoryMapOverlay must be used within HistoryMapOverlayProvider');
  return ctx;
}
