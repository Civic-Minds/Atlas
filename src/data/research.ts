import { Moon, Ticket, Zap, type LucideIcon } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';

/** One piece of Atlas research: the /research index lists them all, and the About page's "Keep looking" the newest (CIV-1205). */
export interface ResearchEntry {
  href: string;
  Icon: LucideIcon;
  /** The small label naming its kind of page (CIV-1167, Ryan's "Sure"). */
  kind: 'Map' | 'Story' | 'Data';
  title: string;
  body: string;
  /** When it was published (YYYY-MM-DD), for "newest first". */
  published: string;
}

/** Every research page, in the /research index's order. A new page is added here and shows up on both pages. */
export const RESEARCH: readonly ResearchEntry[] = [
  {
    href: FEATURE_ROUTES.nightService,
    Icon: Moon,
    kind: 'Map',
    title: 'Overnight service',
    body: 'Find routes with sustained service from 2–5 AM.',
    published: '2026-08-15',
  },
  {
    href: FEATURE_ROUTES.frequentService.story,
    Icon: Zap,
    kind: 'Story',
    title: 'Frequent service',
    body: 'See what frequent service means and which routes meet Atlas’s sustained-frequency thresholds.',
    published: '2026-09-17',
  },
  {
    href: FEATURE_ROUTES.freeChildFares,
    Icon: Ticket,
    kind: 'Data',
    title: 'Free child fares',
    body: "See up to what age children ride free.",
    published: '2026-10-30',
  },
];

/** The newest research, newest first. */
export function newestResearch(count: number, entries: readonly ResearchEntry[] = RESEARCH): ResearchEntry[] {
  return [...entries].sort((a, b) => b.published.localeCompare(a.published)).slice(0, count);
}
