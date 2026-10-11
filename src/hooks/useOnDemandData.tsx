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

/** Wait between automatic retries of a failed index load, and how many to try. */
export const ON_DEMAND_RETRY_MS = 30_000;
export const ON_DEMAND_RETRY_LIMIT = 3;

/**
 * Index once on-demand is first shown on the map, geometry per service on request. A failure sets
 * status 'error' (the map says so). A failed index retries on its own every 30 s, a few times, while
 * on-demand is shown, and again whenever it's shown anew; a failed service retries on its next request.
 */
export function useOnDemandData(enabled: boolean = FEATURES.onDemand): OnDemandData {
  const [status, setStatus] = useState<OnDemandLoadStatus>(enabled ? 'idle' : 'off');
  const [index, setIndex] = useState<OnDemandIndex | null>(null);
  const [geometries, setGeometries] = useState<ReadonlyMap<string, OnDemandGeometry>>(new Map());
  const [visible, setVisible] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const requested = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  // In-flight and retry bookkeeping live in refs, so hiding on-demand mid-load can't strand a load.
  const loading = useRef(false);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearRetry(); };
  }, []);

  useEffect(() => {
    if (!enabled || !visible || index || loading.current) return;
    loading.current = true;
    clearRetry();
    setStatus('loading');
    loadOnDemandIndex()
      .then(loaded => {
        if (!mounted.current) return;
        retries.current = 0;
        setIndex(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!mounted.current) return;
        setStatus('error');
        if (retries.current < ON_DEMAND_RETRY_LIMIT) {
          retries.current += 1;
          retryTimer.current = setTimeout(() => {
            retryTimer.current = null;
            if (mounted.current) setRetryTick(t => t + 1);
          }, ON_DEMAND_RETRY_MS);
        }
      })
      .finally(() => { loading.current = false; });
  }, [enabled, visible, index, retryTick]);

  // Showing on-demand again after the automatic retries ran out starts a fresh round.
  useEffect(() => {
    if (!visible) return;
    retries.current = 0;
  }, [visible]);

  const requestGeometry = useCallback((slugs: readonly string[]) => {
    if (!index) return;
    for (const slug of slugs) {
      if (requested.current.has(slug)) continue;
      requested.current.add(slug);
      loadOnDemandGeometry(index, slug)
        .then(geometry => {
          if (!mounted.current) return;
          failed.current.delete(slug);
          setGeometries(prev => new Map(prev).set(slug, geometry));
          if (failed.current.size === 0) setStatus('ready');
        })
        .catch(() => {
          if (!mounted.current) return;
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
