import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface CorridorMapLine {
  key: string;
  coordinates: number[][];
  color: string;
}

export interface CorridorMapOverlay {
  lines: CorridorMapLine[];
  fromStop: { lat: number; lon: number } | null;
  toStop: { lat: number; lon: number } | null;
  fitPoints: [number, number][];
}

interface ContextValue {
  overlay: CorridorMapOverlay | null;
  setOverlay: (overlay: CorridorMapOverlay | null) => void;
}

const CorridorMapOverlayContext = createContext<ContextValue | null>(null);

export function CorridorMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<CorridorMapOverlay | null>(null);
  const setOverlay = useCallback((o: CorridorMapOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return (
    <CorridorMapOverlayContext.Provider value={value}>
      {children}
    </CorridorMapOverlayContext.Provider>
  );
}

export function useCorridorMapOverlay() {
  const ctx = useContext(CorridorMapOverlayContext);
  if (!ctx) throw new Error('useCorridorMapOverlay must be used within CorridorMapOverlayProvider');
  return ctx;
}
