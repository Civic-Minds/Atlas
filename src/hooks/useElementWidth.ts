import { useEffect, useRef, useState } from 'react';

/**
 * Measures an element's width, so a chart's layout follows the column it sits in, not the window (CIV-2083: one copy
 * for the Live strips and the charts). Put `ref` on the element; `width` is 0 until it is measured.
 */
export function useElementWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width || el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
