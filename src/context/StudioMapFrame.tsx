import { createContext, useContext, type MutableRefObject, type ReactNode } from 'react';
import type { PageMapOverlay } from './PageMapOverlay';

/**
 * Where Studio's map is framed (CIV-1925, CIV-1921). The Studio frame owns it, not its pages: one key per agency and route,
 * and the key last framed, kept across Live and Fleet. Switching pages keeps the map's centre and zoom, as the main map
 * does across its modes; it frames again only for a new agency or route. A page spreads `useStudioMapFrame(loading)`
 * into its overlay and never builds a frame key of its own (oneFrame guard).
 */
export interface StudioMapFrame {
  frameKey: string;
  framedMemory: MutableRefObject<string | null>;
}

/** The frame key for an agency and an open route (or the whole network). One rule for every Studio page. */
export function studioFrameKey(slug: string, route: string | null): string {
  return `${slug}:${route ? `route-${route}` : 'network'}`;
}

const Ctx = createContext<StudioMapFrame | null>(null);

export function StudioMapFrameProvider({ value, children }: { value: StudioMapFrame; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The overlay's framing fields. `loading`: what's drawn is still coming in, so the map waits to frame it whole. */
export function useStudioMapFrame(loading = false): StudioMapFrame & Required<Pick<PageMapOverlay, 'holdFrame'>> {
  const f = useContext(Ctx);
  if (!f) throw new Error('useStudioMapFrame must be used inside Studio');
  return { frameKey: f.frameKey, framedMemory: f.framedMemory, holdFrame: loading };
}
