import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

type PageContentsItem = { id: string; label: string };

/** Height of the sticky site header: a section counts as being read once its top passes this line. */
const HEADER_OFFSET = 72;
/** Slack for "scrolled to the very bottom" (sub-pixel scroll positions). */
const BOTTOM_SLACK = 2;
/** Fallback for browsers without `scrollend`: how long a click keeps its section active while the page scrolls there. */
const CLICK_LOCK_MS = 1000;

/**
 * Scroll-spy: the id of the section being read. A 1px observer band sits just under the sticky header; the
 * section crossing it is active. In the gaps between sections the previous one stays active, and at the very
 * bottom of the page the last section wins even when its heading can never reach the top. A click marks its
 * section active right away and holds it until the scroll it started finishes.
 */
function useActiveSection(ids: readonly string[]): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null);
  const lockedUntil = useRef(0);
  const key = ids.join('\n');
  useEffect(() => {
    if (ids.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const inBand = new Set<string>();
    const update = () => {
      if (Date.now() < lockedUntil.current) return;
      const root = document.documentElement;
      // Back at the top (page title in view, no section reached yet): nothing is highlighted, as on first load.
      if (root.scrollTop <= 0) {
        setActive(null);
        return;
      }
      if (window.innerHeight + root.scrollTop >= root.scrollHeight - BOTTOM_SLACK) {
        setActive(ids[ids.length - 1]);
        return;
      }
      const current = ids.find(id => inBand.has(id));
      if (current) setActive(current);
    };
    let observer: IntersectionObserver | null = null;
    const observe = () => {
      observer?.disconnect();
      inBand.clear();
      const bottom = Math.max(0, window.innerHeight - HEADER_OFFSET - 1);
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        update();
      }, { rootMargin: `-${HEADER_OFFSET}px 0px -${bottom}px 0px` });
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
    };
    observe();
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', observe);
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', observe);
    };
    // `key` stands in for `ids`, so a new array with the same ids does not reconnect the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const select = (id: string) => {
    setActive(id);
    lockedUntil.current = Date.now() + CLICK_LOCK_MS;
    window.addEventListener('scrollend', () => { lockedUntil.current = 0; }, { once: true });
  };
  return [active, select];
}

export default function PageContents({ items, title }: { items: readonly PageContentsItem[]; title?: string }) {
  // Show the page title above the list once the real heading has scrolled up out of view.
  const [titleVisible, setTitleVisible] = useState(false);
  useEffect(() => {
    const heading = document.querySelector('main h1');
    if (!title || !heading || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setTitleVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: '-72px 0px 0px 0px' },
    );
    observer.observe(heading);
    return () => observer.disconnect();
  }, [title]);
  // Desktop shows the list as a sticky sidebar. Smaller screens start it collapsed so the
  // page title and text are not pushed below the first screen.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [active, select] = useActiveSection(items.map(item => item.id));
  // Smooth-scroll to the section (jump if the system asks for reduced motion) and keep the URL hash in sync.
  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    select(id);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    window.history.pushState(null, '', `#${id}`);
  };
  return (
    <nav aria-label="On this page" className="mb-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-4 lg:sticky lg:top-20  lg:mb-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-14">
      {title && (
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 right-0 top-6 hidden truncate text-sm font-black text-[var(--text-primary)] transition-opacity duration-300 motion-reduce:transition-none lg:block ${titleVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          {title}
        </p>
      )}
      <details key={isDesktop ? 'desktop' : 'compact'} open={isDesktop} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-black text-[var(--text-muted)] lg:pointer-events-none lg:mb-2 [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 lg:hidden" aria-hidden="true" />
        </summary>
        <div className="mt-2 grid gap-1.5 text-sm lg:mt-0 lg:block lg:space-y-2">
          {items.map((item) => (
            <a
              key={item.id}
              // The 2px line plus its padding sit in a negative margin, so text lines up whether or not an item is active.
              className={`-ml-[10px] block border-l-2 pl-[8px] hover:underline ${item.id === active ? 'border-[var(--accent)] font-bold text-[var(--text-primary)]' : 'border-transparent text-[var(--accent)]'}`}
              href={`#${item.id}`}
              aria-current={item.id === active ? 'location' : undefined}
              onClick={(event) => goTo(event, item.id)}
            >
              {item.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
