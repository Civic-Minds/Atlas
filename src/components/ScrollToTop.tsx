import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * A page opened through the router starts at the top, as a page opened by a full load does (CIV-1619). Only a change of
 * page counts: the first load, a link to a place on the same page (#hash) and the map's own address changes are left alone.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
