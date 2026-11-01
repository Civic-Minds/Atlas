import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

type PageContentsItem = { id: string; label: string };

/**
 * The reading line, in px from the top of the window: a section counts as being read once its top passes it. It sits
 * below the sticky header and below where a clicked or linked section's heading lands (`scroll-mt-24`).
 */
const READING_LINE = 120;
/** Fallback for browsers without `scrollend`: how long a click keeps its section active while the page scrolls there. */
const CLICK_LOCK_MS = 1000;

/**
 * The index of the section being read, or null before the first one starts. `tops` are the sections' tops relative to
 * the window. Over the last screen of scrolling the reading line slides down to the bottom of the window, so short
 * sections near the end each get their turn and the last section is active at the very bottom, even when its heading
 * can never reach the top (#1275).
 */
export function activeSectionIndex(tops: readonly number[], viewportHeight: number, remainingScroll: number): number | null {
  const slide = viewportHeight > 0 ? Math.max(0, 1 - Math.max(0, remainingScroll) / viewportHeight) : 0;
  const line = READING_LINE + Math.max(0, viewportHeight - READING_LINE) * slide;
  let found: number | null = null;
  tops.forEach((top, i) => { if (top <= line) found = i; });
  return found;
}

/**
 * Scroll-spy: the id of the section being read, measured from the sections' positions on every scroll and resize
 * (#1275: an observer band only updated when a section edge crossed it, so a page opened at a link, or a jump that
 * landed between sections, kept an earlier section or none). Back at the top nothing is highlighted. A click marks its
 * section active right away and holds it until the scroll it started finishes.
 */
function useActiveSection(ids: readonly string[]): [string | null, (id: string) => void] {
  const [active, setActive] = useState<string | null>(null);
  const lockedUntil = useRef(0);
  const key = ids.join('\n');
  useEffect(() => {
    if (ids.length === 0) return;
    const update = () => {
      if (Date.now() < lockedUntil.current) return;
      const root = document.documentElement;
      // Back at the top (page title in view): nothing is highlighted, as on first load.
      if (root.scrollTop <= 0) {
        setActive(null);
        return;
      }
      const sections = ids.map(id => document.getElementById(id));
      const tops = sections.map(el => (el ? el.getBoundingClientRect().top : Infinity));
      const i = activeSectionIndex(tops, window.innerHeight, root.scrollHeight - window.innerHeight - root.scrollTop);
      setActive(i == null ? null : ids[i]);
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; update(); });
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
    // `key` stands in for `ids`, so a new array with the same ids does not re-subscribe.
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
