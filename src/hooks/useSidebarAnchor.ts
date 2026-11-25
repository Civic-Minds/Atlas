import { useEffect, useState, type RefObject } from 'react';
import { SIDEBAR_LEFT_FALLBACK } from '../styles';

/**
 * The one left edge every map card under the search bar shares (#1792): the search bar's own left edge and width, or,
 * when the bar is hidden (Studio), where it would start, just right of the logo by the row's gap.
 *
 * Measured again whenever anything that can move the bar changes size: the page, the bar, the header row and the logo.
 * The logo matters because its wordmark changes width (a mode's name) while the page and the bar keep their size, which
 * used to leave a card ~55px off the bar (Barrie Zone D, #1792). Also measured once the web fonts have loaded.
 */
export function useSidebarAnchor(
  searchBarRef: RefObject<HTMLElement | null>,
  headerLeftRef: RefObject<HTMLElement | null>,
): { sidebarLeft: number; searchBarWidth: number | undefined } {
  const [sidebarLeft, setSidebarLeft] = useState<number>(SIDEBAR_LEFT_FALLBACK);
  const [searchBarWidth, setSearchBarWidth] = useState<number>();
  useEffect(() => {
    const measure = () => {
      const search = searchBarRef.current?.getBoundingClientRect();
      // A hidden box (Studio) measures zero: the cards keep their own width, left where the box would start.
      if (search && search.width > 0) {
        setSidebarLeft(search.left);
        setSearchBarWidth(search.width);
        return;
      }
      setSearchBarWidth(undefined);
      const row = headerLeftRef.current;
      const logo = row?.firstElementChild?.getBoundingClientRect();
      if (row && logo && logo.width > 0) { setSidebarLeft(logo.right + (parseFloat(getComputedStyle(row).columnGap) || 0)); return; }
      const header = row?.getBoundingClientRect();
      if (header) setSidebarLeft(header.left + 138);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    for (const el of [searchBarRef.current, headerLeftRef.current, headerLeftRef.current?.firstElementChild]) if (el) ro.observe(el);
    let live = true;
    document.fonts?.ready.then(() => { if (live) measure(); });
    return () => { live = false; ro.disconnect(); };
  }, [searchBarRef, headerLeftRef]);
  return { sidebarLeft, searchBarWidth };
}
