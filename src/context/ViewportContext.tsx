import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ViewportBounds } from '../hooks/useIntervalStats';

interface ViewportContextValue {
  bounds: ViewportBounds | null;
  zoom: number | null;
  setBoundsAndZoom: (b: ViewportBounds, z: number) => void;
}

const ViewportContext = createContext<ViewportContextValue | null>(null);

export function ViewportProvider({ children }: { children: React.ReactNode }) {
  const [bounds, setBounds] = useState<ViewportBounds | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const setBoundsAndZoom = useCallback((b: ViewportBounds, z: number) => {
    setBounds(b);
    setZoom(z);
  }, []);
  const value = useMemo(() => ({ bounds, zoom, setBoundsAndZoom }), [bounds, zoom, setBoundsAndZoom]);
  return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
}

export function useViewport() {
  const ctx = useContext(ViewportContext);
  if (!ctx) throw new Error('useViewport must be used within ViewportProvider');
  return ctx;
}
