import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { FEATURES } from '../../shared/config';
import { bboxIntersects, type OnDemandGeometry, type OnDemandIndex } from '../../shared/onDemandData';
import { loadOnDemandGeometry, loadOnDemandIndex } from '../lib/onDemandLoader';
import { useViewport } from '../context/ViewportContext';

export type OnDemandLoadStatus = 'off' | 'loading' | 'ready' | 'error';

export interface OnDemandData {
  status: OnDemandLoadStatus;
  index: OnDemandIndex | null;
  geometries: ReadonlyMap<string, OnDemandGeometry>;
  requestGeometry: (slugs: readonly string[]) => void;
}

/** Index on first use, geometry per service on request. Any failure sets status 'error'. */
export function useOnDemandData(enabled: boolean = FEATURES.onDemand): OnDemandData {
  const [status, setStatus] = useState<OnDemandLoadStatus>(enabled ? 'loading' : 'off');
  const [index, setIndex] = useState<OnDemandIndex | null>(null);
  const [geometries, setGeometries] = useState<ReadonlyMap<string, OnDemandGeometry>>(new Map());
  const requested = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadOnDemandIndex()
      .then(loaded => { if (!cancelled) { setIndex(loaded); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [enabled]);

  const requestGeometry = useCallback((slugs: readonly string[]) => {
    if (!index) return;
    for (const slug of slugs) {
      if (requested.current.has(slug)) continue;
      requested.current.add(slug);
      loadOnDemandGeometry(index, slug)
        .then(geometry => setGeometries(prev => new Map(prev).set(slug, geometry)))
        .catch(() => setStatus('error'));
    }
  }, [index]);

  return { status, index, geometries, requestGeometry };
}

const OnDemandStatusContext = createContext<OnDemandLoadStatus>('off');

export function OnDemandStatusProvider({ status, children }: { status: OnDemandLoadStatus; children: React.ReactNode }) {
  return <OnDemandStatusContext.Provider value={status}>{children}</OnDemandStatusContext.Provider>;
}

export function useOnDemandStatus(): OnDemandLoadStatus {
  return useContext(OnDemandStatusContext);
}

/** Requests geometry for every service whose area is in view (or near it). Renders nothing. */
export function OnDemandViewportLoader({ data }: { data: OnDemandData }) {
  const { bounds } = useViewport();
  const { index, requestGeometry } = data;
  useEffect(() => {
    if (!index || !bounds) return;
    // Pad the view by half its size so zones are ready just before they scroll in.
    const padLat = (bounds.n - bounds.s) / 2;
    const padLon = (bounds.e - bounds.w) / 2;
    const padded = { s: bounds.s - padLat, n: bounds.n + padLat, w: bounds.w - padLon, e: bounds.e + padLon };
    requestGeometry(index.services.filter(s => bboxIntersects(s.bbox, padded)).map(s => s.slug));
  }, [index, bounds, requestGeometry]);
  return null;
}
