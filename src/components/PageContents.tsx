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
/** Space kept above or below the active item when the list scrolls it into view. */
const LIST_SCROLL_MARGIN = 16;
/** How far the list fades out at an edge with more entries past it. */
const LIST_FADE_PX = 24;

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
  // A list taller than the window scrolls inside its box (#1279); keep the section being read in view there.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || !active || list.scrollHeight <= list.clientHeight) return;
    const item = Array.from(list.children).find(el => el.getAttribute('href') === `#${active}`);
    if (!item) return;
    const box = list.getBoundingClientRect();
    const at = item.getBoundingClientRect();
    if (at.top < box.top) list.scrollTop -= box.top - at.top + LIST_SCROLL_MARGIN;
    else if (at.bottom > box.bottom) list.scrollTop += at.bottom - box.bottom + LIST_SCROLL_MARGIN;
  }, [active]);
  // A scrolled list fades out at the edge with more entries past it, so a cut-off entry reads as "more" (#1279).
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => {
      const above = list.scrollTop > 1;
      const below = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
      setMore(m => (m.above === above && m.below === below ? m : { above, below }));
    };
    update();
    list.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      list.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isDesktop]);
  const fade = more.above || more.below
    ? `linear-gradient(to bottom, ${more.above ? 'transparent' : '#000'}, #000 ${LIST_FADE_PX}px, #000 calc(100% - ${LIST_FADE_PX}px), ${more.below ? 'transparent' : '#000'})`
    : undefined;
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
        {/*
          On wide screens the list scrolls inside its own box once it is taller than the window allows (#1279), so the
          sticky box never outgrows the text column and the page title above it stays pinned below the site header. The
          height leaves room for the box's offset and title space, "On this page", and the footer below the column at the
          end of the page, measured with the footer as it is now: if the footer or the box's offset changes, measure again. The
          padding, taken back by negative margins, keeps the active item's left line and the focus outlines inside the box.
        */}
        <div ref={listRef} style={fade ? { maskImage: fade, WebkitMaskImage: fade } : undefined} className="mt-2 grid gap-1.5 text-sm lg:-my-1 lg:-ml-[14px] lg:-mr-1 lg:block lg:max-h-[calc(100vh-320px)] lg:space-y-2 lg:overflow-y-auto lg:overscroll-contain lg:py-1 lg:pl-[14px] lg:pr-1">
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
