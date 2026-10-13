import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';

type PageContentsItem = { id: string; label: string };

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
  // Smooth-scroll to the section (jump if the system asks for reduced motion) and keep the URL hash in sync.
  const goTo = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
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
            <a key={item.id} className="block text-[var(--accent)] hover:underline" href={`#${item.id}`} onClick={(event) => goTo(event, item.id)}>
              {item.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
