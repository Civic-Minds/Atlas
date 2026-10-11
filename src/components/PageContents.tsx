import { ChevronDown } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';

type PageContentsItem = { id: string; label: string };

export default function PageContents({ items }: { items: readonly PageContentsItem[] }) {
  // Desktop shows the list as a sticky sidebar. Smaller screens start it collapsed so the
  // page title and text are not pushed below the first screen.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  return (
    <nav aria-label="On this page" className="mb-8 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-btn)] p-4 lg:sticky lg:top-8 lg:mb-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-14">
      <details key={isDesktop ? 'desktop' : 'compact'} open={isDesktop} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-black text-[var(--text-muted)] lg:pointer-events-none lg:mb-2 [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 lg:hidden" aria-hidden="true" />
        </summary>
        <div className="mt-2 grid gap-1.5 text-sm lg:mt-0 lg:block lg:space-y-2">
          {items.map((item) => (
            <a key={item.id} className="block text-[var(--accent)] hover:underline" href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
