import { Moon, Ticket, Zap, type LucideIcon } from 'lucide-react';
import { FEATURE_ROUTES } from '../../shared/config';

/** One piece of Atlas research: the /research index lists them all, and the About page's "Explore our research" the newest (CIV-1205). */
export interface ResearchEntry {
  href: string;
  Icon: LucideIcon;
  /** The small label naming its kind of page (CIV-1167, Ryan's "Sure"). */
  kind: 'Map' | 'Story' | 'Data';
  title: string;
  body: string;
  /** The card's link text, Ryan's wording per card (CIV-1205). */
  linkText: string;
  /** When it was published (YYYY-MM-DD), for "newest first". */
  published: string;
  /**
   * Its share picture, as `${picture}-light.${pictureExt}` and `${picture}-dark.${pictureExt}` (CIV-1167): the About page's story tiles
   * show it (CIV-1206). Overnight is Ryan's pick 1 and Frequent his pick B4; Free child fares is a stand-in until he picks its own.
   */
  picture: string;
  /** The picture's file type: 'svg' unless it is a photo ('png'). */
  pictureExt?: 'svg' | 'png';
}

/** Every research page, in the /research index's order. A new page is added here and shows up on both pages. */
export const RESEARCH: readonly ResearchEntry[] = [
  {
    href: FEATURE_ROUTES.nightService,
    Icon: Moon,
    kind: 'Map',
    title: 'Overnight service',
    // A word joiner after the dash keeps "2–5 AM" on one line.
    body: 'See which routes keep running from 2–\u20605 AM, and how often they come.',
    linkText: 'Find routes running all night',
    published: '2026-08-15',
    picture: '/assets/research/share/night',
  },
  {
    href: FEATURE_ROUTES.frequentService.story,
    Icon: Zap,
    kind: 'Story',
    title: 'Frequent service',
    body: 'What agencies in Canada and the US mean when they call a bus frequent.',
    linkText: 'Compare agency definitions',
    published: '2026-09-17',
    picture: '/assets/research/share/frequent',
    pictureExt: 'png',
  },
  {
    href: FEATURE_ROUTES.freeChildFares,
    Icon: Ticket,
    kind: 'Data',
    title: 'Free child fares',
    body: 'Up to what age children ride free on transit in Canada and the US, and which systems are free for everyone.',
    linkText: 'See which ages ride free',
    published: '2026-10-30',
    picture: '/assets/research/share/free-child-fares',
  },
];

/** The newest research, newest first. */
export function newestResearch(count: number, entries: readonly ResearchEntry[] = RESEARCH): ResearchEntry[] {
  return [...entries].sort((a, b) => b.published.localeCompare(a.published)).slice(0, count);
}
