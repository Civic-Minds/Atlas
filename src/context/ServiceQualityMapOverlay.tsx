import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export interface SQStop {
  lon: number;
  lat: number;
  hw: number;
}

export interface ServiceQualityOverlay {
  stops: SQStop[];
  threshold: number; // show stops with hw <= threshold; 999 = all
}

interface ContextValue {
  overlay: ServiceQualityOverlay | null;
  setOverlay: (overlay: ServiceQualityOverlay | null) => void;
}

const ServiceQualityMapOverlayContext = createContext<ContextValue | null>(null);

export function ServiceQualityMapOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlay, setOverlayState] = useState<ServiceQualityOverlay | null>(null);
  const setOverlay = useCallback((o: ServiceQualityOverlay | null) => setOverlayState(o), []);
  const value = useMemo(() => ({ overlay, setOverlay }), [overlay, setOverlay]);
  return (
    <ServiceQualityMapOverlayContext.Provider value={value}>
      {children}
    </ServiceQualityMapOverlayContext.Provider>
  );
}

export function useServiceQualityMapOverlay() {
  const ctx = useContext(ServiceQualityMapOverlayContext);
  if (!ctx) throw new Error('useServiceQualityMapOverlay must be used within ServiceQualityMapOverlayProvider');
  return ctx;
}
