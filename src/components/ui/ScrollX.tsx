import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A box that scrolls sideways when its content (a wide table) is wider than it, with a fade at its right edge while
 * more is to the right, as the route card fades at its bottom (#1188: phone tables looked cut off).
 */
export default function ScrollX({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = useCallback(() => {
    const el = ref.current;
    if (el) setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
  }, []);
  useEffect(() => {
    const el = ref.current;
    check();
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [check]);
  return (
    <div className={`relative ${className}`}>
      <div ref={ref} onScroll={check} className="overflow-x-auto">{children}</div>
      {more && <div data-scroll-fade aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--bg-app)] to-transparent" />}
    </div>
  );
}
