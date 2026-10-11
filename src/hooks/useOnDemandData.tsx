import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FEATURES } from '../../shared/config';
import { bboxIntersects, type OnDemandGeometry, type OnDemandIndex } from '../../shared/onDemandData';
import { loadOnDemandGeometry, loadOnDemandIndex } from '../lib/onDemandLoader';
import { useViewport } from '../context/ViewportContext';

export type OnDemandLoadStatus = 'off' | 'idle' | 'loading' | 'ready' | 'error';

export interface OnDemandData {
  status: OnDemandLoadStatus;
  index: OnDemandIndex | null;
  geometries: ReadonlyMap<string, OnDemandGeometry>;
  /** Whether the map currently shows on-demand (set by the map); nothing loads until it does. */
  visible: boolean;
  setVisible: (visible: boolean) => void;
  requestGeometry: (slugs: readonly string[]) => void;
}

/**
 * Index once on-demand is first shown on the map, geometry per service on request. A failure sets
 * status 'error'; a failed index is retried the next time on-demand is shown, and a failed service
 * the next time it's requested.
 */
export function useOnDemandData(enabled: boolean = FEATURES.onDemand): OnDemandData {
  const [status, setStatus] = useState<OnDemandLoadStatus>(enabled ? 'idle' : 'off');
  const [index, setIndex] = useState<OnDemandIndex | null>(null);
  const [geometries, setGeometries] = useState<ReadonlyMap<string, OnDemandGeometry>>(new Map());
  const [visible, setVisible] = useState(false);
  const requested = useRef(new Set<string>());
  const failed = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled || !visible || index || status === 'loading') return;
    let cancelled = false;
    setStatus('loading');
    loadOnDemandIndex()
      .then(loaded => { if (!cancelled) { setIndex(loaded); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
    // Re-run only when on-demand is shown again; status is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, visible, index]);

  const requestGeometry = useCallback((slugs: readonly string[]) => {
    if (!index) return;
    for (const slug of slugs) {
      if (requested.current.has(slug)) continue;
      requested.current.add(slug);
      loadOnDemandGeometry(index, slug)
        .then(geometry => {
          failed.current.delete(slug);
          setGeometries(prev => new Map(prev).set(slug, geometry));
          if (failed.current.size === 0) setStatus('ready');
        })
        .catch(() => {
          // Forget the request so the next view change tries again.
          requested.current.delete(slug);
          failed.current.add(slug);
          setStatus('error');
        });
    }
  }, [index]);

  return useMemo(
    () => ({ status, index, geometries, visible, setVisible, requestGeometry }),
    [status, index, geometries, visible, requestGeometry],
  );
}

const OnDemandContext = createContext<Pick<OnDemandData, 'status' | 'setVisible'>>({ status: 'off', setVisible: () => {} });

export function OnDemandStatusProvider({ data, children }: { data: OnDemandData; children: React.ReactNode }) {
  const value = useMemo(() => ({ status: data.status, setVisible: data.setVisible }), [data.status, data.setVisible]);
  return <OnDemandContext.Provider value={value}>{children}</OnDemandContext.Provider>;
}

export function useOnDemandStatus(): OnDemandLoadStatus {
  return useContext(OnDemandContext).status;
}

/** The map reports whether it shows on-demand, so files load only when they'd be drawn. */
export function useReportOnDemandVisible(visible: boolean): void {
  const { setVisible } = useContext(OnDemandContext);
  useEffect(() => { setVisible(visible); }, [visible, setVisible]);
}

/** Requests geometry for every service whose area is in view (or near it). Renders nothing. */
export function OnDemandViewportLoader({ data }: { data: OnDemandData }) {
  const { bounds } = useViewport();
  const { index, visible, requestGeometry } = data;
  useEffect(() => {
    if (!index || !bounds || !visible) return;
    // Pad the view by half its size so zones are ready just before they scroll in.
    const padLat = (bounds.n - bounds.s) / 2;
    const padLon = (bounds.e - bounds.w) / 2;
    const padded = { s: bounds.s - padLat, n: bounds.n + padLat, w: bounds.w - padLon, e: bounds.e + padLon };
    requestGeometry(index.services.filter(s => bboxIntersects(s.bbox, padded)).map(s => s.slug));
  }, [index, bounds, visible, requestGeometry]);
  return null;
}
