import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react';
import { sidebarFrameStyle } from '../styles';

/**
 * Where a view's sidebar card sits on the main map (CIV-1925): the left edge the main map's card uses and, on desktop,
 * the search bar's width, which the card copies. App provides it once; History, Studio, Live, Night, Bustang and the
 * research cards read it, instead of each one taking the numbers as props.
 */
interface SidebarFrame { sidebarLeft?: number; searchBarWidth?: number }

const Ctx = createContext<SidebarFrame>({});

/** `searchBarWidth` is the desktop width; leave it out on phones, where the card is the bottom sheet's width. */
export function SidebarFrameProvider({ sidebarLeft, searchBarWidth, children }: SidebarFrame & { children: ReactNode }) {
  const value = useMemo(() => ({ sidebarLeft, searchBarWidth }), [sidebarLeft, searchBarWidth]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The sidebar card's place (sidebarFrameStyle) and the numbers it came from. */
export function useSidebarFrame(): SidebarFrame & { style: CSSProperties } {
  const f = useContext(Ctx);
  return useMemo(() => ({ ...f, style: sidebarFrameStyle(f.sidebarLeft, f.searchBarWidth) }), [f]);
}
