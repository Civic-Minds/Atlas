import { useEffect, useState, useSyncExternalStore } from 'react';
import { FEATURES } from '../../shared/config';
import { isLivePollingRoute } from '../../shared/livePollingConfig';
import type { SegmentBand, SegmentDelayData, SegmentView } from '../utils/segmentDelayView';

// One fetch per route, shared by the map overlay and the route card.
const cache = new Map<string, Promise<SegmentDelayData | null>>();

function load(slug: string, route: string): Promise<SegmentDelayData | null> {
  const key = `${slug}::${route}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/live-segments?agency=${encodeURIComponent(slug)}&route=${encodeURIComponent(route)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => (j && !j.noData && !j.error && Array.isArray(j.segments) ? (j as SegmentDelayData) : null))
      .catch(() => null);
    cache.set(key, p);
    p.then(d => { if (!d) cache.delete(key); });
  }
  return p;
}

/** Archived "where vehicles lose time" stats for a live route (Live mode only). */
export function useSegmentDelay(slug: string | null | undefined, routeShortName: string | null | undefined) {
  const [data, setData] = useState<SegmentDelayData | null>(null);
  const enabled = FEATURES.live && !!slug && !!routeShortName && isLivePollingRoute(slug, routeShortName);
  useEffect(() => {
    setData(null);
    if (!enabled) return;
    let cancelled = false;
    load(slug!, routeShortName!).then(d => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, [enabled, slug, routeShortName]);
  return enabled ? data : null;
}

// Selected time band, shared between the card's picker and the map overlay.
let band: SegmentBand = 'all';
const listeners = new Set<() => void>();
export function setSegmentBand(next: SegmentBand) {
  band = next;
  listeners.forEach(l => l());
}
export function useSegmentBand(): SegmentBand {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => band,
  );
}

// Which view the card shows (running time or spacing); the map follows it.
let view: SegmentView = 'time';
export function setSegmentView(next: SegmentView) {
  view = next;
  listeners.forEach(l => l());
}
export function useSegmentView(): SegmentView {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => view,
  );
}
